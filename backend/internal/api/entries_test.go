package api

import (
	"fmt"
	"net/http"
	"testing"
	"time"
)

func TestCreateEntryStoresTextAndWordCount(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "Morning walk",
		"document": doc("A calm morning in the park with coffee."),
	}, "")
	if resp.status != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", resp.status, resp.body)
	}
	var payload struct {
		ID        uint   `json:"id"`
		PlainText string `json:"plainText"`
		WordCount int    `json:"wordCount"`
		Revision  int    `json:"revision"`
	}
	resp.json(t, &payload)
	if payload.PlainText != "A calm morning in the park with coffee." {
		t.Fatalf("unexpected plain text %q", payload.PlainText)
	}
	if payload.WordCount != 8 {
		t.Fatalf("expected 8 words, got %d", payload.WordCount)
	}
	if payload.Revision != 1 {
		t.Fatalf("expected revision 1, got %d", payload.Revision)
	}
}

func TestWordCountTreatsChineseCharactersAsWords(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "周末",
		"document": doc("今天天气很好"),
	}, "")
	var payload struct {
		WordCount int `json:"wordCount"`
	}
	resp.json(t, &payload)
	if payload.WordCount != 6 {
		t.Fatalf("expected 6 words, got %d", payload.WordCount)
	}
}

func TestStaleRevisionIsRejected(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "Original",
		"document": doc("first version"),
	}, "")
	var created struct {
		ID       uint `json:"id"`
		Revision int  `json:"revision"`
	}
	resp.json(t, &created)

	// A second device still holds revision 1.
	stale := c.do(http.MethodPatch, fmt.Sprintf("/api/entries/%d", created.ID), map[string]any{
		"title":    "Stale write",
		"revision": created.Revision,
	}, "")
	if stale.status != http.StatusOK {
		t.Fatalf("the first write should succeed, got %d (%s)", stale.status, stale.body)
	}

	conflict := c.do(http.MethodPatch, fmt.Sprintf("/api/entries/%d", created.ID), map[string]any{
		"title":    "Stale write",
		"revision": created.Revision,
	}, "")
	if conflict.status != http.StatusConflict {
		t.Fatalf("expected 409, got %d (%s)", conflict.status, conflict.body)
	}
	if code := conflict.errorCode(t); code != "conflict" {
		t.Fatalf("expected a conflict error code, got %q", code)
	}
}

func TestUpdateBumpsTheRevision(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "Original",
		"document": doc("first version"),
	}, "")
	var created struct {
		ID       uint `json:"id"`
		Revision int  `json:"revision"`
	}
	resp.json(t, &created)

	update := c.do(http.MethodPatch, fmt.Sprintf("/api/entries/%d", created.ID), map[string]any{
		"title":    "Updated",
		"revision": created.Revision,
	}, "")
	if update.status != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", update.status, update.body)
	}
	var updated struct {
		Title    string `json:"title"`
		Revision int    `json:"revision"`
	}
	update.json(t, &updated)
	if updated.Title != "Updated" {
		t.Fatalf("expected the title to change, got %q", updated.Title)
	}
	if updated.Revision <= created.Revision {
		t.Fatalf("expected the revision to increase, got %d", updated.Revision)
	}
}

func TestInvalidDrawingDoesNotBreakTheResponse(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":   "Broken drawing",
		"drawing": "not json at all",
	}, "")
	if resp.status != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", resp.status, resp.body)
	}
	// The listing must still render.
	list := c.get("/api/entries")
	if list.status != http.StatusOK || len(list.body) == 0 {
		t.Fatalf("expected a usable listing, got %d (%s)", list.status, list.body)
	}
}

func TestEventTimeIsStoredInUTCAndTheDateIsLocal(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	// 2026-03-01 00:30 in Shanghai is still 2026-02-28 in UTC.
	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":     "Late night",
		"document":  doc("writing"),
		"eventTime": "2026-02-28T16:30:00Z",
		"timezone":  "Asia/Shanghai",
	}, "")
	var payload struct {
		EventTime time.Time `json:"eventTime"`
		EventDate string    `json:"eventDate"`
		Timezone  string    `json:"timezone"`
	}
	resp.json(t, &payload)
	if payload.EventTime.Format(time.RFC3339) != "2026-02-28T16:30:00Z" {
		t.Fatalf("expected the event time in UTC, got %s", payload.EventTime.Format(time.RFC3339))
	}
	if payload.EventDate != "2026-03-01" {
		t.Fatalf("expected the local date 2026-03-01, got %s", payload.EventDate)
	}
}

func TestInvalidEventTimeIsRejected(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":     "Broken",
		"eventTime": "not a timestamp",
	}, "")
	if resp.status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d (%s)", resp.status, resp.body)
	}
}

func TestKeysetPaginationHasNoDuplicatesAndNoSkips(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	const total = 25
	for i := 0; i < total; i++ {
		// The same timestamp for several entries exercises the tie breaker.
		stamp := time.Date(2026, 5, 1, 12, 0, i%3, 0, time.UTC).Format(time.RFC3339)
		resp := c.do(http.MethodPost, "/api/entries", map[string]any{
			"title":     "Entry " + itoa(uint(i)),
			"document":  doc("content"),
			"eventTime": stamp,
		}, "")
		if resp.status != http.StatusCreated {
			t.Fatalf("create entry %d: %d (%s)", i, resp.status, resp.body)
		}
	}

	seen := map[uint]bool{}
	cursor := ""
	pages := 0
	for {
		path := "/api/entries?limit=7"
		if cursor != "" {
			path += "&cursor=" + cursor
		}
		resp := c.get(path)
		if resp.status != http.StatusOK {
			t.Fatalf("list: %d (%s)", resp.status, resp.body)
		}
		var entries []struct {
			ID uint `json:"id"`
		}
		resp.json(t, &entries)
		for _, e := range entries {
			if seen[e.ID] {
				t.Fatalf("entry %d appeared twice across pages", e.ID)
			}
			seen[e.ID] = true
		}
		pages++
		cursor = resp.nextCursor(t)
		if cursor == "" {
			break
		}
		if pages > 20 {
			t.Fatal("pagination did not terminate")
		}
	}
	if len(seen) != total {
		t.Fatalf("expected %d entries across pages, got %d", total, len(seen))
	}
}

func TestDeleteEntryRemovesIt(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	id := createEntry(t, c, "Temporary", "content")
	resp := c.do(http.MethodDelete, "/api/entries/"+itoa(id), nil, "")
	if resp.status != http.StatusNoContent {
		t.Fatalf("expected 204, got %d (%s)", resp.status, resp.body)
	}
	if got := c.get("/api/entries/" + itoa(id)); got.status != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", got.status)
	}
}

func TestFilterByFolderAndTags(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	folderResp := c.do(http.MethodPost, "/api/folders", map[string]string{"name": "Trips"}, "")
	var folder struct {
		ID uint `json:"id"`
	}
	folderResp.json(t, &folder)

	tagResp := c.do(http.MethodPost, "/api/tags", map[string]string{"name": "Beach"}, "")
	var tag struct {
		ID uint `json:"id"`
	}
	tagResp.json(t, &tag)

	inside := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "In the folder",
		"document": doc("content"),
		"folderId": folder.ID,
		"tagIds":   []uint{tag.ID},
	}, "")
	if inside.status != http.StatusCreated {
		t.Fatalf("create: %d (%s)", inside.status, inside.body)
	}
	c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "Outside",
		"document": doc("content"),
	}, "")

	var entries []struct {
		Title string `json:"title"`
	}
	c.get("/api/entries?folderId="+itoa(folder.ID)).json(t, &entries)
	if len(entries) != 1 || entries[0].Title != "In the folder" {
		t.Fatalf("folder filter returned %+v", entries)
	}

	entries = nil
	c.get("/api/entries?tags="+itoa(tag.ID)).json(t, &entries)
	if len(entries) != 1 || entries[0].Title != "In the folder" {
		t.Fatalf("tag filter returned %+v", entries)
	}

	entries = nil
	c.get("/api/entries?folderId=none").json(t, &entries)
	if len(entries) != 1 || entries[0].Title != "Outside" {
		t.Fatalf("unfiled filter returned %+v", entries)
	}
}

func TestPinnedFilter(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "Pinned",
		"document": doc("content"),
		"isPinned": true,
	}, "")
	c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "Not pinned",
		"document": doc("content"),
	}, "")

	var entries []struct {
		Title string `json:"title"`
	}
	c.get("/api/entries?pinned=true").json(t, &entries)
	if len(entries) != 1 || entries[0].Title != "Pinned" {
		t.Fatalf("pinned filter returned %+v", entries)
	}
}

func TestPartialUpdateKeepsTheFieldsItDoesNotMention(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "Morning walk",
		"document": doc("A calm morning in the park."),
		"color":    "#ff0000",
	}, "")
	if resp.status != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", resp.status, resp.body)
	}
	var created struct {
		ID       uint `json:"id"`
		Revision int  `json:"revision"`
	}
	resp.json(t, &created)

	// Pinning the entry must not touch the title, the text or the colour.
	resp = c.do(http.MethodPatch, fmt.Sprintf("/api/entries/%d", created.ID), map[string]any{
		"isPinned": true,
	}, "")
	if resp.status != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", resp.status, resp.body)
	}
	var patched struct {
		Title     string `json:"title"`
		PlainText string `json:"plainText"`
		Color     string `json:"color"`
		IsPinned  bool   `json:"isPinned"`
	}
	resp.json(t, &patched)
	if patched.Title != "Morning walk" {
		t.Fatalf("a partial update cleared the title: %q", patched.Title)
	}
	if patched.PlainText != "A calm morning in the park." {
		t.Fatalf("a partial update cleared the text: %q", patched.PlainText)
	}
	if patched.Color != "#ff0000" {
		t.Fatalf("a partial update cleared the colour: %q", patched.Color)
	}
	if !patched.IsPinned {
		t.Fatal("the entry was not pinned")
	}
}

func TestUpdateCanClearTheTitleAndTheColour(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title": "Morning walk",
		"color": "#ff0000",
	}, "")
	var created struct {
		ID uint `json:"id"`
	}
	resp.json(t, &created)

	resp = c.do(http.MethodPatch, fmt.Sprintf("/api/entries/%d", created.ID), map[string]any{
		"title": "",
		"color": "",
	}, "")
	if resp.status != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", resp.status, resp.body)
	}
	var patched struct {
		Title string `json:"title"`
		Color string `json:"color"`
	}
	resp.json(t, &patched)
	if patched.Title != "" {
		t.Fatalf("the title was not cleared: %q", patched.Title)
	}
	if patched.Color != "" {
		t.Fatalf("the colour was not cleared: %q", patched.Color)
	}
}

func TestTagOnlyUpdateKeepsTheFolder(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	folderResp := c.do(http.MethodPost, "/api/folders", map[string]string{"name": "Trips"}, "")
	var folder struct {
		ID uint `json:"id"`
	}
	folderResp.json(t, &folder)

	tagResp := c.do(http.MethodPost, "/api/tags", map[string]string{"name": "Beach"}, "")
	var tag struct {
		ID uint `json:"id"`
	}
	tagResp.json(t, &tag)

	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "In the folder",
		"document": doc("content"),
		"folderId": folder.ID,
	}, "")
	var created struct {
		ID       uint  `json:"id"`
		FolderID *uint `json:"folderId"`
	}
	resp.json(t, &created)
	if created.FolderID == nil || *created.FolderID != folder.ID {
		t.Fatalf("the entry was not created in the folder: %+v", created.FolderID)
	}

	// A request that only changes the tags must leave the folder alone.
	resp = c.do(http.MethodPatch, fmt.Sprintf("/api/entries/%d", created.ID), map[string]any{
		"tagIds": []uint{tag.ID},
	}, "")
	if resp.status != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", resp.status, resp.body)
	}
	var patched struct {
		FolderID *uint `json:"folderId"`
		Tags     []struct {
			Name string `json:"name"`
		} `json:"tags"`
	}
	resp.json(t, &patched)
	if patched.FolderID == nil || *patched.FolderID != folder.ID {
		t.Fatalf("a tag-only update moved the entry out of its folder: %+v", patched.FolderID)
	}
	if len(patched.Tags) != 1 || patched.Tags[0].Name != "Beach" {
		t.Fatalf("the tag was not attached: %+v", patched.Tags)
	}
}

func TestUpdateCanMoveAnEntryBackToTheDefaultStream(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	folderResp := c.do(http.MethodPost, "/api/folders", map[string]string{"name": "Trips"}, "")
	var folder struct {
		ID uint `json:"id"`
	}
	folderResp.json(t, &folder)

	resp := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "In the folder",
		"document": doc("content"),
		"folderId": folder.ID,
	}, "")
	var created struct {
		ID uint `json:"id"`
	}
	resp.json(t, &created)

	// An explicit null folder moves the entry back to the default stream.
	resp = c.do(http.MethodPatch, fmt.Sprintf("/api/entries/%d", created.ID), map[string]any{
		"folderId": nil,
	}, "")
	if resp.status != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", resp.status, resp.body)
	}
	var patched struct {
		FolderID *uint `json:"folderId"`
	}
	resp.json(t, &patched)
	if patched.FolderID != nil {
		t.Fatalf("the entry was not moved to the default stream: %+v", *patched.FolderID)
	}
}
