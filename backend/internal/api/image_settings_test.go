package api

import (
	"net/http"
	"testing"
)

// TestSettingsKeepTheCompression checks that the settings of the pictures
// are stored on the account and that they are checked before they are
// saved.
func TestSettingsKeepTheCompression(t *testing.T) {
	h := newHarness(t)
	c := h.register("compresser", "testpassword123")

	var settings struct {
		CompressImages    bool `json:"compressImages"`
		ImageQuality      int  `json:"imageQuality"`
		ImageMaxDimension int  `json:"imageMaxDimension"`
	}
	resp := c.get("/api/settings")
	if resp.status != http.StatusOK {
		t.Fatalf("settings: status %d body %s", resp.status, resp.body)
	}
	resp.json(t, &settings)
	if !settings.CompressImages {
		t.Fatalf("the compression should be on by default, got %+v", settings)
	}
	if settings.ImageQuality != 80 || settings.ImageMaxDimension != 2048 {
		t.Fatalf("unexpected defaults: %+v", settings)
	}

	resp = c.do(http.MethodPatch, "/api/settings", map[string]any{
		"compressImages":    true,
		"imageQuality":      65,
		"imageMaxDimension": 1536,
	}, "")
	if resp.status != http.StatusOK {
		t.Fatalf("update settings: status %d body %s", resp.status, resp.body)
	}
	resp.json(t, &settings)
	if settings.ImageQuality != 65 || settings.ImageMaxDimension != 1536 {
		t.Fatalf("the settings were not stored: %+v", settings)
	}

	// A quality that would ruin the picture is refused.
	resp = c.do(http.MethodPatch, "/api/settings", map[string]any{"imageQuality": 5}, "")
	if resp.status != http.StatusBadRequest {
		t.Fatalf("a bad quality should be refused, got %d body %s", resp.status, resp.body)
	}

	// A size that is not a number of pixels is refused as well.
	resp = c.do(http.MethodPatch, "/api/settings", map[string]any{"imageMaxDimension": 12}, "")
	if resp.status != http.StatusBadRequest {
		t.Fatalf("a bad size should be refused, got %d body %s", resp.status, resp.body)
	}
}

// TestEntryKeepsThePictureThatLeadsIt checks that the picture which leads an
// entry in the timeline is stored with it.
func TestEntryKeepsThePictureThatLeadsIt(t *testing.T) {
	h := newHarness(t)
	c := h.register("cover", "testpassword123")

	content := encodePNG(t, newRGBAImage(40, 30))
	resp := c.upload("/api/media", "files", "photo.png", content, nil)
	if resp.status != http.StatusCreated {
		t.Fatalf("upload: status %d body %s", resp.status, resp.body)
	}
	var uploaded []struct {
		ID uint `json:"id"`
	}
	resp.json(t, &uploaded)
	if len(uploaded) != 1 {
		t.Fatalf("expected one file, got %d", len(uploaded))
	}
	coverID := uploaded[0].ID

	resp = c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":        "With a picture",
		"mediaIds":     []uint{coverID},
		"coverMediaId": coverID,
	}, "")
	if resp.status != http.StatusCreated {
		t.Fatalf("create entry: status %d body %s", resp.status, resp.body)
	}
	var entry struct {
		ID           uint  `json:"id"`
		CoverMediaID *uint `json:"coverMediaId"`
	}
	resp.json(t, &entry)
	if entry.CoverMediaID == nil || *entry.CoverMediaID != coverID {
		t.Fatalf("the picture that leads the entry was not stored: %+v", entry)
	}

	// A picture of another account is refused.
	other := h.register("stranger", "testpassword123")
	otherContent := encodePNG(t, newRGBAImage(20, 20))
	otherResp := other.upload("/api/media", "files", "other.png", otherContent, nil)
	var otherMedia []struct {
		ID uint `json:"id"`
	}
	otherResp.json(t, &otherMedia)
	if len(otherMedia) != 1 {
		t.Fatalf("expected one file, got %d", len(otherMedia))
	}
	resp = c.do(http.MethodPatch, "/api/entries/"+itoa(entry.ID), map[string]any{
		"coverMediaId": otherMedia[0].ID,
	}, "")
	if resp.status != http.StatusBadRequest {
		t.Fatalf("a picture of another account should be refused, got %d body %s", resp.status, resp.body)
	}

	// The choice can be cleared again.
	resp = c.do(http.MethodPatch, "/api/entries/"+itoa(entry.ID), map[string]any{
		"coverMediaId": nil,
	}, "")
	if resp.status != http.StatusOK {
		t.Fatalf("clear the cover: status %d body %s", resp.status, resp.body)
	}
	resp.json(t, &entry)
	if entry.CoverMediaID != nil {
		t.Fatalf("the choice was not cleared: %+v", entry)
	}
}

// TestUploadTooLargeIsExplained checks that an upload above the limit says
// what the limit is, so the interface can tell the reader.
func TestUploadTooLargeIsExplained(t *testing.T) {
	h := newHarness(t)
	c := h.register("big", "testpassword123")

	tooBig := make([]byte, h.server.cfg.MaxUploadBytes+1024)
	resp := c.upload("/api/media", "files", "big.bin", tooBig, nil)
	if resp.status != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d body %s", resp.status, resp.body)
	}
	if resp.errorCode(t) != "payload_too_large" {
		t.Fatalf("unexpected error code: %s", resp.errorCode(t))
	}
	var envelope struct {
		Error struct {
			Message string            `json:"message"`
			Details map[string]string `json:"details"`
		} `json:"error"`
	}
	decode(t, resp.body, &envelope)
	if envelope.Error.Details["limitMB"] == "" {
		t.Fatalf("the limit should be named: %s", resp.body)
	}
}

// TestReverseGeocodeNeedsTheSearchService checks that naming a point needs
// the same optional service as the place search, and that a bad point is
// refused.
func TestReverseGeocodeNeedsTheSearchService(t *testing.T) {
	h := newHarness(t)
	c := h.register("where", "testpassword123")

	// The search service is off in the tests, so the answer is that it is
	// not available.
	resp := c.get("/api/locations/reverse?lat=31.2304&lon=121.4737")
	if resp.status != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d body %s", resp.status, resp.body)
	}

	// A point that is not a number is refused before anything else.
	resp = c.get("/api/locations/reverse?lat=north&lon=121.4737")
	if resp.status != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d body %s", resp.status, resp.body)
	}
}
