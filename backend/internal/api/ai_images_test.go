package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/wei/journal/backend/internal/models"
)

// TestAttachingAPictureQueuesItsDescription covers the path a picture takes
// when it lands in an entry: the row is written, the job is queued, and the
// panel that shows the entry can say what is happening.
func TestAttachingAPictureQueuesItsDescription(t *testing.T) {
	h := newHarness(t)
	c := h.register("picture-owner", "a-long-password-123")

	// The account has to allow the model, and the server has to have one.
	if err := h.handle.DB().Model(&models.UserSettings{}).Where("user_id = ?", c.userID).
		Update("ai_enabled", true).Error; err != nil {
		t.Fatalf("enable ai: %v", err)
	}
	h.server.cfg.EnableAI = true
	h.server.cfg.OpenAIAPIKey = "a-key"

	upload := c.upload("/api/media", "files", "photo.png",
		encodePNG(t, newRGBAImage(48, 32)), nil)
	if upload.status != http.StatusCreated {
		t.Fatalf("upload: status %d body %s", upload.status, upload.body)
	}
	var assets []struct {
		ID uint `json:"id"`
	}
	upload.json(t, &assets)
	if len(assets) != 1 {
		t.Fatalf("the upload answered with %d assets", len(assets))
	}

	created := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "A picture",
		"document": `{"type":"doc","content":[{"type":"paragraph"}]}`,
		"mediaIds": []uint{assets[0].ID},
	}, c.csrf)
	if created.status != http.StatusCreated {
		t.Fatalf("create entry: status %d body %s", created.status, created.body)
	}
	var entry struct {
		ID uint `json:"id"`
	}
	created.json(t, &entry)

	var jobs []models.Job
	if err := h.handle.DB().Where("type = ? AND target_id = ?", "ai.describe_image", assets[0].ID).
		Find(&jobs).Error; err != nil {
		t.Fatalf("load jobs: %v", err)
	}
	if len(jobs) != 1 {
		t.Fatalf("%d describe jobs were queued for the picture", len(jobs))
	}

	var meta models.AIMetadata
	if err := h.handle.DB().Where("media_id = ? AND kind = ?", assets[0].ID, "image").
		First(&meta).Error; err != nil {
		t.Fatalf("the picture has no metadata row: %v", err)
	}
	if meta.Status != models.AIPending {
		t.Errorf("the metadata status is %q, want %q", meta.Status, models.AIPending)
	}

	// Saving the entry again must not queue the same picture a second time.
	_ = c.do(http.MethodPatch, "/api/entries/"+itoa(entry.ID), map[string]any{
		"document": `{"type":"doc","content":[{"type":"paragraph"}]}`,
		"mediaIds": []uint{assets[0].ID},
	}, c.csrf)
	var again []models.Job
	if err := h.handle.DB().Where("type = ? AND target_id = ?", "ai.describe_image", assets[0].ID).
		Find(&again).Error; err != nil {
		t.Fatalf("load jobs again: %v", err)
	}
	if len(again) != 1 {
		t.Errorf("saving again queued another job: %d", len(again))
	}
}

// TestADescriptionIsNotQueuedWhenTheAccountTurnedAIOff keeps the switch that
// the account chose: no text and no picture leaves the server without it.
func TestADescriptionIsNotQueuedWhenTheAccountTurnedAIOff(t *testing.T) {
	h := newHarness(t)
	c := h.register("picture-owner-off", "a-long-password-123")
	h.server.cfg.EnableAI = true
	h.server.cfg.OpenAIAPIKey = "a-key"

	upload := c.upload("/api/media", "files", "photo.png",
		encodePNG(t, newRGBAImage(24, 24)), nil)
	if upload.status != http.StatusCreated {
		t.Fatalf("upload: status %d body %s", upload.status, upload.body)
	}
	var assets []struct {
		ID uint `json:"id"`
	}
	if err := json.Unmarshal(extractData(t, upload.body), &assets); err != nil {
		t.Fatalf("decode upload: %v", err)
	}

	created := c.do(http.MethodPost, "/api/entries", map[string]any{
		"title":    "A picture",
		"document": `{"type":"doc","content":[{"type":"paragraph"}]}`,
		"mediaIds": []uint{assets[0].ID},
	}, c.csrf)
	if created.status != http.StatusCreated {
		t.Fatalf("create entry: status %d body %s", created.status, created.body)
	}

	var count int64
	h.handle.DB().Model(&models.Job{}).Where("type = ?", "ai.describe_image").Count(&count)
	if count != 0 {
		t.Errorf("%d describe jobs were queued although the account said no", count)
	}
}

// extractData pulls the data envelope out of a response body.
func extractData(t *testing.T, body []byte) json.RawMessage {
	t.Helper()
	var envelope struct {
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("decode envelope: %v", err)
	}
	return envelope.Data
}
