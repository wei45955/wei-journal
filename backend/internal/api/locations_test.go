package api

import (
	"net/http"
	"testing"
)

// A place service is optional. A server built without one must still answer
// the questions about places, instead of failing on them.
func TestPlaceSearchWithoutAService(t *testing.T) {
	h := newHarness(t)

	// The service is left out on purpose, the way a server that was never
	// given one would have it. Without the fallback in NewServer this would
	// be a nil interface, and the first question about places would fail.
	server := NewServer(Options{
		Config:   h.server.cfg,
		Handle:   h.server.handle,
		Logger:   h.server.log,
		Auth:     h.server.auth,
		Search:   h.server.search,
		Indexer:  h.server.index,
		Storage:  h.server.storage,
		Queue:    h.server.queue,
		Provider: h.server.provider,
		Version:  "test",
	})
	h.server = server

	c := h.register("nobuilder", "nobuilder-password")
	resp := c.do(http.MethodGet, "/api/locations/capabilities", nil, "")
	if resp.status != http.StatusOK {
		t.Fatalf("the capabilities answered with %d: %s", resp.status, resp.body)
	}

	// The search itself is off, and says so rather than failing.
	resp = c.do(http.MethodGet, "/api/locations/search?q=anywhere", nil, "")
	if resp.status != http.StatusServiceUnavailable {
		t.Fatalf("the search answered with %d: %s", resp.status, resp.body)
	}
}
