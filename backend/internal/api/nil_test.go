package api

import "testing"

// A server whose place service was never set must not fall over, even when
// the search is switched on in the settings.
func TestNilGeocoderIsSafe(t *testing.T) {
	h := newHarness(t)
	h.server.cfg.GeocodingEnabled = true
	s := &Server{cfg: h.server.cfg, log: h.server.log}

	// The call the handlers make. A nil interface would panic here.
	if s.geocodingEnabled() {
		t.Fatal("a server without a place service should report the search as off")
	}
}
