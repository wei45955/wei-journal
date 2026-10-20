package api

import (
	"net/http"
	"testing"
)

// A deleted tag name must be reusable. Tags are soft deleted, so the unique
// index on (user_id, normalized_name) has to ignore the deleted rows.
func TestDeletedTagNameCanBeReused(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/tags", map[string]string{"name": "Beach"}, "")
	if resp.status != http.StatusCreated {
		t.Fatalf("create tag: %d (%s)", resp.status, resp.body)
	}
	var created struct {
		ID uint `json:"id"`
	}
	resp.json(t, &created)

	del := c.do(http.MethodDelete, "/api/tags/"+itoa(created.ID), nil, "")
	if del.status != http.StatusNoContent {
		t.Fatalf("delete tag: %d (%s)", del.status, del.body)
	}

	again := c.do(http.MethodPost, "/api/tags", map[string]string{"name": "Beach"}, "")
	if again.status != http.StatusCreated {
		t.Fatalf("expected the tag name to be reusable, got %d (%s)", again.status, again.body)
	}
	var recreated struct {
		ID uint `json:"id"`
	}
	again.json(t, &recreated)
	if recreated.ID == created.ID {
		t.Fatal("expected a new tag id")
	}

	// The list must show exactly one tag with that name.
	var tags []struct {
		Name string `json:"name"`
	}
	c.get("/api/tags").json(t, &tags)
	if len(tags) != 1 {
		t.Fatalf("expected one tag, got %d (%+v)", len(tags), tags)
	}
}

// A live tag name must still be rejected, so the partial index does not
// weaken the uniqueness guarantee.
func TestExistingTagNameIsStillRejected(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	c.do(http.MethodPost, "/api/tags", map[string]string{"name": "Beach"}, "")
	// The comparison ignores case and surrounding whitespace.
	resp := c.do(http.MethodPost, "/api/tags", map[string]string{"name": "  beach "}, "")
	if resp.status != http.StatusConflict {
		t.Fatalf("expected 409, got %d (%s)", resp.status, resp.body)
	}
}

// A tag that was deleted and recreated must still be attachable to an entry
// by name, which is how the editor adds tags.
func TestRecreatedTagCanBeAttachedByName(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/tags", map[string]string{"name": "Beach"}, "")
	var created struct {
		ID uint `json:"id"`
	}
	resp.json(t, &created)
	c.do(http.MethodDelete, "/api/tags/"+itoa(created.ID), nil, "")

	entry := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "Sunny",
		"document": doc("content"),
		"tagNames": []string{"Beach"},
	}, "")
	if entry.status != http.StatusCreated {
		t.Fatalf("expected 201, got %d (%s)", entry.status, entry.body)
	}
	var payload struct {
		Tags []struct {
			Name string `json:"name"`
		} `json:"tags"`
	}
	entry.json(t, &payload)
	if len(payload.Tags) != 1 || payload.Tags[0].Name != "Beach" {
		t.Fatalf("expected the tag to be attached, got %+v", payload.Tags)
	}
}
