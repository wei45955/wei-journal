package api

import (
	"net/http"
	"testing"
)

// createEntry creates an entry and returns its id.
func createEntry(t *testing.T, c *client, title, text string) uint {
	t.Helper()
	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    title,
		"document": doc(text),
	}, "")
	if resp.status != http.StatusCreated {
		t.Fatalf("create entry: %d (%s)", resp.status, resp.body)
	}
	var payload struct {
		ID uint `json:"id"`
	}
	resp.json(t, &payload)
	return payload.ID
}

func TestEntryOfAnotherUserIsNotReadable(t *testing.T) {
	h := newHarness(t)
	alice := h.register("alice", "correct horse battery")
	bob := h.register("bob", "another good password")

	id := createEntry(t, alice, "Alice's secret", "private thoughts")

	resp := bob.get("/api/entries/" + itoa(id))
	if resp.status != http.StatusNotFound {
		t.Fatalf("expected 404, got %d (%s)", resp.status, resp.body)
	}
}

func TestEntryOfAnotherUserCannotBeModifiedOrDeleted(t *testing.T) {
	h := newHarness(t)
	alice := h.register("alice", "correct horse battery")
	bob := h.register("bob", "another good password")

	id := createEntry(t, alice, "Alice's entry", "content")

	patch := bob.do(http.MethodPatch, "/api/entries/"+itoa(id), map[string]string{"title": "hijacked"}, "")
	if patch.status != http.StatusNotFound {
		t.Fatalf("patch: expected 404, got %d (%s)", patch.status, patch.body)
	}
	del := bob.do(http.MethodDelete, "/api/entries/"+itoa(id), nil, "")
	if del.status != http.StatusNotFound {
		t.Fatalf("delete: expected 404, got %d (%s)", del.status, del.body)
	}

	// The entry is untouched.
	var payload struct {
		Title string `json:"title"`
	}
	alice.get("/api/entries/"+itoa(id)).json(t, &payload)
	if payload.Title != "Alice's entry" {
		t.Fatalf("the entry was modified by another account: %q", payload.Title)
	}
}

func TestListingsOnlyContainOwnRecords(t *testing.T) {
	h := newHarness(t)
	alice := h.register("alice", "correct horse battery")
	bob := h.register("bob", "another good password")

	createEntry(t, alice, "Alice one", "alpha")
	createEntry(t, alice, "Alice two", "beta")
	createEntry(t, bob, "Bob one", "gamma")

	var entries []struct {
		ID    uint   `json:"id"`
		Title string `json:"title"`
	}
	alice.get("/api/entries?limit=50").json(t, &entries)
	if len(entries) != 2 {
		t.Fatalf("expected 2 entries for alice, got %d", len(entries))
	}
	for _, e := range entries {
		if e.Title == "Bob one" {
			t.Fatal("bob's entry leaked into alice's list")
		}
	}

	entries = nil
	bob.get("/api/entries?limit=50").json(t, &entries)
	if len(entries) != 1 || entries[0].Title != "Bob one" {
		t.Fatalf("expected only bob's entry, got %+v", entries)
	}
}

func TestFoldersAndTagsAreIsolated(t *testing.T) {
	h := newHarness(t)
	alice := h.register("alice", "correct horse battery")
	bob := h.register("bob", "another good password")

	aliceResp := alice.do(http.MethodPost, "/api/folders", map[string]string{"name": "Alice folder"}, "")
	if aliceResp.status != http.StatusCreated {
		t.Fatalf("create folder: %d (%s)", aliceResp.status, aliceResp.body)
	}
	var folder struct {
		ID uint `json:"id"`
	}
	aliceResp.json(t, &folder)

	aliceTag := alice.do(http.MethodPost, "/api/tags", map[string]string{"name": "Alice tag"}, "")
	var tag struct {
		ID uint `json:"id"`
	}
	aliceTag.json(t, &tag)

	// Bob cannot see, change or delete them.
	var folders []struct {
		ID uint `json:"id"`
	}
	bob.get("/api/folders").json(t, &folders)
	if len(folders) != 0 {
		t.Fatalf("bob sees %d folders", len(folders))
	}
	var tags []struct {
		ID uint `json:"id"`
	}
	bob.get("/api/tags").json(t, &tags)
	if len(tags) != 0 {
		t.Fatalf("bob sees %d tags", len(tags))
	}
	if resp := bob.do(http.MethodPatch, "/api/folders/"+itoa(folder.ID), map[string]string{"name": "stolen"}, ""); resp.status != http.StatusNotFound {
		t.Fatalf("patch folder: expected 404, got %d", resp.status)
	}
	if resp := bob.do(http.MethodDelete, "/api/folders/"+itoa(folder.ID), nil, ""); resp.status != http.StatusNotFound {
		t.Fatalf("delete folder: expected 404, got %d", resp.status)
	}
	if resp := bob.do(http.MethodDelete, "/api/tags/"+itoa(tag.ID), nil, ""); resp.status != http.StatusNotFound {
		t.Fatalf("delete tag: expected 404, got %d", resp.status)
	}
}

func TestSearchNeverReturnsAnotherUsersEntries(t *testing.T) {
	h := newHarness(t)
	alice := h.register("alice", "correct horse battery")
	bob := h.register("bob", "another good password")

	createEntry(t, alice, "Hidden treasure", "a very distinctive phrase about penguins")
	createEntry(t, bob, "Bob entry", "nothing to see here")

	resp := bob.get("/api/search?q=penguins")
	var results []struct {
		Entry struct {
			ID    uint   `json:"id"`
			Title string `json:"title"`
		} `json:"entry"`
	}
	resp.json(t, &results)
	if len(results) != 0 {
		t.Fatalf("bob's search returned %d results from alice's archive", len(results))
	}
}

func TestMediaOfAnotherUserIsNotAccessible(t *testing.T) {
	h := newHarness(t)
	alice := h.register("alice", "correct horse battery")
	bob := h.register("bob", "another good password")

	content := pngBytes(t, 8, 8)
	upload := alice.upload("/api/media", "files", "photo.png", content, nil)
	if upload.status != http.StatusCreated {
		t.Fatalf("upload: %d (%s)", upload.status, upload.body)
	}
	var assets []struct {
		ID uint `json:"id"`
	}
	upload.json(t, &assets)
	if len(assets) != 1 {
		t.Fatalf("expected one asset, got %d", len(assets))
	}
	id := assets[0].ID

	for _, path := range []string{
		"/api/media/" + itoa(id),
		"/api/media/" + itoa(id) + "/file",
		"/api/media/" + itoa(id) + "/thumb",
		"/api/media/" + itoa(id) + "/preview",
	} {
		resp := bob.get(path)
		if resp.status != http.StatusNotFound {
			t.Fatalf("%s: expected 404, got %d", path, resp.status)
		}
	}
	if resp := bob.do(http.MethodDelete, "/api/media/"+itoa(id), nil, ""); resp.status != http.StatusNotFound {
		t.Fatalf("delete: expected 404, got %d", resp.status)
	}
}

func TestStatsAreScopedToTheOwner(t *testing.T) {
	h := newHarness(t)
	alice := h.register("alice", "correct horse battery")
	bob := h.register("bob", "another good password")

	createEntry(t, alice, "One", "alpha")
	createEntry(t, alice, "Two", "beta")
	createEntry(t, bob, "Three", "gamma")

	var stats struct {
		TotalEntries int `json:"totalEntries"`
	}
	bob.get("/api/stats").json(t, &stats)
	if stats.TotalEntries != 1 {
		t.Fatalf("expected bob to see 1 entry in his stats, got %d", stats.TotalEntries)
	}
	alice.get("/api/stats").json(t, &stats)
	if stats.TotalEntries != 2 {
		t.Fatalf("expected alice to see 2 entries, got %d", stats.TotalEntries)
	}
}

func TestExportContainsOnlyOwnRecords(t *testing.T) {
	h := newHarness(t)
	alice := h.register("alice", "correct horse battery")
	bob := h.register("bob", "another good password")

	createEntry(t, alice, "Alice entry", "alpha")
	createEntry(t, bob, "Bob entry", "beta")

	var payload struct {
		Entries []struct {
			Title string `json:"title"`
		} `json:"entries"`
	}
	bob.get("/api/export").json(t, &payload)
	if len(payload.Entries) != 1 || payload.Entries[0].Title != "Bob entry" {
		t.Fatalf("export leaked another account: %+v", payload.Entries)
	}
}

func TestLocationOfAnotherUserIsNotReadable(t *testing.T) {
	h := newHarness(t)
	alice := h.register("alice", "correct horse battery")
	bob := h.register("bob", "another good password")

	id := createEntry(t, alice, "Alice entry", "alpha")
	resp := alice.do(http.MethodPost, "/api/entries/"+itoa(id)+"/location", map[string]any{
		"latitude": 48.8566, "longitude": 2.3522, "name": "Paris",
	}, "")
	if resp.status != http.StatusOK && resp.status != http.StatusCreated {
		t.Fatalf("set location: %d (%s)", resp.status, resp.body)
	}

	var locations []struct {
		Name string `json:"name"`
	}
	bob.get("/api/locations").json(t, &locations)
	if len(locations) != 0 {
		t.Fatalf("bob sees %d of alice's locations", len(locations))
	}
}
