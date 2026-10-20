package api

import (
	"net/http"
	"testing"
)

// folderID creates a folder and returns its id.
func folderID(t *testing.T, c *client, name string) uint {
	t.Helper()
	resp := c.do(http.MethodPost, "/api/folders", map[string]string{"name": name}, "")
	if resp.status != http.StatusCreated {
		t.Fatalf("create folder %q: %d (%s)", name, resp.status, resp.body)
	}
	var folder struct {
		ID uint `json:"id"`
	}
	resp.json(t, &folder)
	return folder.ID
}

func TestFolderDeleteMovesEntriesToTheDefaultStream(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	folder := folderID(t, c, "Trips")
	entry := createEntry(t, c, "Trip", "content")
	c.do(http.MethodPatch, "/api/entries/"+itoa(entry), map[string]any{"folderId": folder}, "")

	resp := c.do(http.MethodDelete, "/api/folders/"+itoa(folder)+"?strategy=default", nil, "")
	if resp.status != http.StatusNoContent {
		t.Fatalf("expected 204, got %d (%s)", resp.status, resp.body)
	}

	var payload struct {
		FolderID *uint `json:"folderId"`
		Title    string
	}
	c.get("/api/entries/"+itoa(entry)).json(t, &payload)
	if payload.FolderID != nil {
		t.Fatalf("expected the entry to be unfiled, got folder %d", *payload.FolderID)
	}
	// The entry itself must survive.
	var entries []struct {
		Title string `json:"title"`
	}
	c.get("/api/entries").json(t, &entries)
	if len(entries) != 1 {
		t.Fatalf("expected the entry to survive, got %d entries", len(entries))
	}
}

func TestFolderDeleteCanAlsoRemoveTheEntries(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	folder := folderID(t, c, "Doomed")
	entry := createEntry(t, c, "Doomed entry", "content")
	c.do(http.MethodPatch, "/api/entries/"+itoa(entry), map[string]any{"folderId": folder}, "")

	// Without the confirmation the delete is refused.
	resp := c.do(http.MethodDelete, "/api/folders/"+itoa(folder)+"?strategy=delete", nil, "")
	if resp.status != http.StatusBadRequest {
		t.Fatalf("expected 400 without confirm, got %d (%s)", resp.status, resp.body)
	}

	confirmed := c.do(http.MethodDelete, "/api/folders/"+itoa(folder)+"?strategy=delete&confirm=true", nil, "")
	if confirmed.status != http.StatusNoContent {
		t.Fatalf("expected 204, got %d (%s)", confirmed.status, confirmed.body)
	}
	if got := c.get("/api/entries/" + itoa(entry)); got.status != http.StatusNotFound {
		t.Fatalf("expected the entry to be removed, got %d", got.status)
	}
}

func TestDuplicateFolderNameIsRejected(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	folderID(t, c, "Trips")
	resp := c.do(http.MethodPost, "/api/folders", map[string]string{"name": "Trips"}, "")
	if resp.status != http.StatusConflict {
		t.Fatalf("expected 409, got %d (%s)", resp.status, resp.body)
	}
}

func TestFolderListIncludesEntryCounts(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	folder := folderID(t, c, "Trips")
	createEntry(t, c, "One", "content")
	entry := createEntry(t, c, "Two", "content")
	c.do(http.MethodPatch, "/api/entries/"+itoa(entry), map[string]any{"folderId": folder}, "")

	var folders []struct {
		Name       string `json:"name"`
		EntryCount int64  `json:"entryCount"`
	}
	c.get("/api/folders").json(t, &folders)
	if len(folders) != 1 {
		t.Fatalf("expected one folder, got %d", len(folders))
	}
	if folders[0].EntryCount != 1 {
		t.Fatalf("expected a count of 1, got %d", folders[0].EntryCount)
	}
}

func TestFolderReorder(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	first := folderID(t, c, "First")
	second := folderID(t, c, "Second")

	resp := c.do(http.MethodPost, "/api/folders/reorder", map[string]any{
		"folderIds": []uint{second, first},
	}, "")
	if resp.status != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", resp.status, resp.body)
	}
	var folders []struct {
		ID       uint   `json:"id"`
		Name     string `json:"name"`
		Position int    `json:"position"`
	}
	c.get("/api/folders").json(t, &folders)
	if len(folders) != 2 {
		t.Fatalf("expected two folders, got %d", len(folders))
	}
	if folders[0].Name != "Second" {
		t.Fatalf("expected the new order, got %+v", folders)
	}
}
