// Package worker implements the background job handlers. Every handler is
// idempotent so a job that is retried after a crash cannot corrupt state.
package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"time"

	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/ai"
	"github.com/wei/journal/backend/internal/indexer"
	"github.com/wei/journal/backend/internal/jobs"
	"github.com/wei/journal/backend/internal/media"
	"github.com/wei/journal/backend/internal/models"
)

// Worker owns the dependencies the job handlers need.
type Worker struct {
	db       *gorm.DB
	log      *slog.Logger
	storage  *media.Storage
	provider ai.Provider
	index    *indexer.Indexer
	// Model names are recorded on the derived metadata so the interface can
	// show which model produced it.
	visionModel string
	textModel   string
}

// Options carries the dependencies of a Worker.
type Options struct {
	DB          *gorm.DB
	Logger      *slog.Logger
	Storage     *media.Storage
	Provider    ai.Provider
	Indexer     *indexer.Indexer
	VisionModel string
	TextModel   string
}

// New builds a Worker.
func New(opts Options) *Worker {
	return &Worker{
		db:          opts.DB,
		log:         opts.Logger,
		storage:     opts.Storage,
		provider:    opts.Provider,
		index:       opts.Indexer,
		visionModel: opts.VisionModel,
		textModel:   opts.TextModel,
	}
}

// Register installs every handler on the queue worker.
func (w *Worker) Register(qw *jobs.Worker) {
	qw.Register(jobs.TypeDescribeImage, w.handleDescribeImage)
	qw.Register(jobs.TypeSummarizeText, w.handleSummarizeText)
	qw.Register(jobs.TypeBuildThumbnail, w.handleBuildThumbnail)
	qw.Register(jobs.TypeCleanupOrphans, w.handleCleanupOrphans)
}

// handleDescribeImage produces a description for one still image. A failure
// is recorded on the metadata row and never propagated to the entry save.
func (w *Worker) handleDescribeImage(ctx context.Context, job models.Job) error {
	var asset models.MediaAsset
	if err := w.db.Where("id = ? AND user_id = ?", job.TargetID, job.UserID).First(&asset).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if asset.Kind != models.MediaImage && asset.Kind != models.MediaLiveStill {
		return nil
	}

	meta, err := w.imageMeta(asset.ID, job.UserID)
	if err != nil {
		return err
	}
	w.setAIMetaStatus(meta, models.AIProcessing, "")

	if !w.provider.Available() {
		w.setAIMetaStatus(meta, models.AIUnavailable, "no language model provider is configured")
		return nil
	}
	// The user can turn AI off after the job was queued.
	if !w.userAllowsAI(job.UserID) {
		w.setAIMetaStatus(meta, models.AIUnavailable, "AI processing is turned off for this account")
		return nil
	}

	abs, err := w.storage.Absolute(asset.StoredPath)
	if err != nil {
		w.setAIMetaStatus(meta, models.AIFailed, "the stored file could not be located")
		return nil
	}
	raw, err := os.Open(abs)
	if err != nil {
		w.setAIMetaStatus(meta, models.AIFailed, "the stored file could not be read")
		return nil
	}
	defer raw.Close()

	// The model receives a bounded JPEG, never the untouched original.
	encoded, err := media.EncodeScaledJPEG(raw, 1024)
	if err != nil {
		w.setAIMetaStatus(meta, models.AIFailed, "the image format cannot be processed")
		return nil
	}

	desc, err := w.provider.DescribeImage(ctx, encoded, "image/jpeg", ai.DescribeOptions{
		Language: w.language(job.UserID),
		MaxWords: 60,
	})
	if err != nil {
		w.setAIMetaStatus(meta, models.AIFailed, err.Error())
		w.log.Warn("describe image failed", "media", asset.ID, "error", err)
		return nil
	}

	keywords := append(append([]string{}, desc.Keywords...), desc.Subjects...)
	updates := map[string]any{
		"description":    desc.Description,
		"keywords":       encodeList(keywords),
		"suggested_tags": encodeList(desc.SuggestedTags),
		"model":          w.visionModel,
		"status":         models.AICompleted,
		"error":          "",
		"updated_at":     time.Now().UTC(),
	}
	if err := w.db.Model(&models.AIMetadata{}).Where("id = ?", meta.ID).Updates(updates).Error; err != nil {
		return err
	}
	w.reindexParent(asset)
	return nil
}

// handleSummarizeText summarises the written content of an entry.
func (w *Worker) handleSummarizeText(ctx context.Context, job models.Job) error {
	var entry models.Entry
	if err := w.db.Where("id = ? AND user_id = ?", job.TargetID, job.UserID).First(&entry).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if entry.PlainText == "" {
		return nil
	}

	meta, err := w.textMeta(entry.ID, job.UserID)
	if err != nil {
		return err
	}
	w.setAIMetaStatus(meta, models.AIProcessing, "")

	if !w.provider.Available() {
		w.setAIMetaStatus(meta, models.AIUnavailable, "no language model provider is configured")
		return nil
	}
	if !w.userAllowsAI(job.UserID) {
		w.setAIMetaStatus(meta, models.AIUnavailable, "AI processing is turned off for this account")
		return nil
	}

	summary, err := w.provider.SummarizeText(ctx, entry.PlainText, ai.SummarizeOptions{
		Language: w.language(job.UserID),
		MaxWords: 80,
	})
	if err != nil {
		w.setAIMetaStatus(meta, models.AIFailed, err.Error())
		w.log.Warn("summarize text failed", "entry", entry.ID, "error", err)
		return nil
	}

	updates := map[string]any{
		"summary":        summary.Summary,
		"keywords":       encodeList(summary.Keywords),
		"suggested_tags": encodeList(summary.SuggestedTags),
		"model":          w.textModel,
		"status":         models.AICompleted,
		"error":          "",
		"updated_at":     time.Now().UTC(),
	}
	if err := w.db.Model(&models.AIMetadata{}).Where("id = ?", meta.ID).Updates(updates).Error; err != nil {
		return err
	}
	if err := w.index.RebuildEntry(job.UserID, entry.ID); err != nil {
		w.log.Warn("reindex after summary failed", "entry", entry.ID, "error", err)
	}
	return nil
}

// handleBuildThumbnail derives the thumbnail and preview of an image.
func (w *Worker) handleBuildThumbnail(ctx context.Context, job models.Job) error {
	var asset models.MediaAsset
	if err := w.db.Where("id = ? AND user_id = ?", job.TargetID, job.UserID).First(&asset).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if asset.Kind != models.MediaImage && asset.Kind != models.MediaLiveStill {
		return nil
	}

	abs, err := w.storage.Absolute(asset.StoredPath)
	if err != nil {
		return nil
	}
	if _, err := os.Stat(abs); err != nil {
		return nil
	}

	thumbRel, thumbAbs, err := w.storage.DerivedPath(asset.UserID, fmt.Sprintf("%d-thumb.jpg", asset.ID))
	if err != nil {
		return err
	}
	previewRel, previewAbs, err := w.storage.DerivedPath(asset.UserID, fmt.Sprintf("%d-preview.jpg", asset.ID))
	if err != nil {
		return err
	}

	updates := map[string]any{"updated_at": time.Now().UTC()}

	thumbInfo, err := media.Resize(abs, thumbAbs, media.ThumbMax)
	if err == nil {
		updates["derived_path"] = thumbRel
		updates["width"] = thumbInfo.Width
		updates["height"] = thumbInfo.Height
	} else if !errors.Is(err, media.ErrUnsupportedImage) {
		return err
	}

	previewInfo, err := media.Resize(abs, previewAbs, media.PreviewMax)
	if err == nil {
		updates["preview_path"] = previewRel
		if _, ok := updates["width"]; !ok {
			updates["width"] = previewInfo.Width
			updates["height"] = previewInfo.Height
		}
	} else if !errors.Is(err, media.ErrUnsupportedImage) {
		return err
	}

	return w.db.Model(&models.MediaAsset{}).Where("id = ?", asset.ID).Updates(updates).Error
}

// handleCleanupOrphans removes the files of deleted entries and media. The
// database rows are removed by the request handlers; this job only collects
// the bytes on disk, which is why a crash can never lose a referenced file.
func (w *Worker) handleCleanupOrphans(ctx context.Context, job models.Job) error {
	var payload struct {
		EntryID uint `json:"entryId"`
		MediaID uint `json:"mediaId"`
	}
	if job.PayloadJSON != "" {
		if err := json.Unmarshal([]byte(job.PayloadJSON), &payload); err != nil {
			return err
		}
	}

	if payload.MediaID != 0 {
		var asset models.MediaAsset
		err := w.db.Unscoped().Where("id = ? AND user_id = ?", payload.MediaID, job.UserID).First(&asset).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err == nil {
			w.removeAssetFiles(&asset)
			w.db.Unscoped().Delete(&models.MediaAsset{}, asset.ID)
		}
		return nil
	}

	if payload.EntryID != 0 {
		// Soft deleted entries keep their media rows, so the files are found
		// through the relation rather than through the entry itself.
		var assets []models.MediaAsset
		if err := w.db.Unscoped().Where("entry_id = ? AND user_id = ?", payload.EntryID, job.UserID).
			Find(&assets).Error; err != nil {
			return err
		}
		for i := range assets {
			w.removeAssetFiles(&assets[i])
			w.db.Unscoped().Delete(&models.MediaAsset{}, assets[i].ID)
		}
		return nil
	}
	return nil
}

func (w *Worker) removeAssetFiles(asset *models.MediaAsset) {
	if asset.StoredPath != "" {
		if err := w.storage.RemoveUpload(asset.StoredPath); err != nil {
			w.log.Warn("remove upload failed", "media", asset.ID, "error", err)
		}
	}
	if asset.DerivedPath != "" {
		w.storage.RemoveDerived(asset.DerivedPath)
	}
	if asset.PreviewPath != "" {
		w.storage.RemoveDerived(asset.PreviewPath)
	}
}

// imageMeta loads or creates the AI metadata row of an image.
func (w *Worker) imageMeta(mediaID, userID uint) (*models.AIMetadata, error) {
	var meta models.AIMetadata
	err := w.db.Where("media_id = ? AND kind = ?", mediaID, "image").First(&meta).Error
	if err == nil {
		return &meta, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	meta = models.AIMetadata{
		UserID:  userID,
		MediaID: &mediaID,
		Kind:    "image",
		Status:  models.AIPending,
	}
	if err := w.db.Create(&meta).Error; err != nil {
		return nil, err
	}
	return &meta, nil
}

// textMeta loads or creates the AI metadata row of an entry.
func (w *Worker) textMeta(entryID, userID uint) (*models.AIMetadata, error) {
	var meta models.AIMetadata
	err := w.db.Where("entry_id = ? AND kind = ?", entryID, "text").First(&meta).Error
	if err == nil {
		return &meta, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	meta = models.AIMetadata{
		UserID:  userID,
		EntryID: &entryID,
		Kind:    "text",
		Status:  models.AIPending,
	}
	if err := w.db.Create(&meta).Error; err != nil {
		return nil, err
	}
	return &meta, nil
}

func (w *Worker) setAIMetaStatus(meta *models.AIMetadata, status, message string) {
	updates := map[string]any{
		"status":     status,
		"error":      message,
		"updated_at": time.Now().UTC(),
	}
	w.db.Model(&models.AIMetadata{}).Where("id = ?", meta.ID).Updates(updates)
}

// userAllowsAI reports whether the account opted into AI processing.
func (w *Worker) userAllowsAI(userID uint) bool {
	var settings models.UserSettings
	err := w.db.Where("user_id = ?", userID).First(&settings).Error
	if err != nil {
		return false
	}
	return settings.AIEnabled
}

// language returns the language the derived text should be written in.
func (w *Worker) language(userID uint) string {
	var settings models.UserSettings
	if err := w.db.Where("user_id = ?", userID).First(&settings).Error; err != nil {
		return "English"
	}
	if settings.Language == "zh-CN" {
		return "Simplified Chinese"
	}
	return "English"
}

// reindexParent refreshes the search index of the entry a media asset
// belongs to.
func (w *Worker) reindexParent(asset models.MediaAsset) {
	if asset.EntryID == nil {
		return
	}
	if err := w.index.RebuildEntry(asset.UserID, *asset.EntryID); err != nil {
		w.log.Warn("reindex after description failed", "entry", *asset.EntryID, "error", err)
	}
}

func encodeList(items []string) string {
	if items == nil {
		items = []string{}
	}
	b, err := json.Marshal(items)
	if err != nil {
		return "[]"
	}
	return string(b)
}
