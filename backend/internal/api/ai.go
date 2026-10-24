package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/ai"
	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/httpx"
	"github.com/wei/journal/backend/internal/models"
)

// handleAIStatus reports whether AI processing is available and why not when
// it is not, so the interface can explain itself.
func (s *Server) handleAIStatus(c *gin.Context) {
	user := auth.CurrentUser(c)
	configured := s.cfg.AIConfigured()
	enabled := s.aiEnabled(user.ID)

	httpx.OK(c, gin.H{
		"configured": configured,
		"enabled":    enabled,
		"consent":    enabled,
		"model":      s.cfg.OpenAIVision,
		"textModel":  s.cfg.OpenAIText,
		"status":     aiStatusLabel(configured, enabled),
	})
}

func aiStatusLabel(configured, enabled bool) string {
	switch {
	case !configured:
		return "unavailable"
	case !enabled:
		return "disabled"
	default:
		return "ready"
	}
}

// handleAIMetadata lists the derived metadata of an entry.
func (s *Server) handleAIMetadata(c *gin.Context) {
	user := auth.CurrentUser(c)
	q := s.handle.DB().Model(&models.AIMetadata{}).Where("user_id = ?", user.ID)
	if entryID := c.Query("entryId"); entryID != "" {
		q = q.Where("entry_id = ?", entryID)
	}
	if mediaID := c.Query("mediaId"); mediaID != "" {
		q = q.Where("media_id = ?", mediaID)
	}
	var rows []models.AIMetadata
	if err := q.Order("id DESC").Limit(200).Find(&rows).Error; err != nil {
		httpx.Internal(c, s.log, err, "load ai metadata")
		return
	}
	out := make([]AIMetadataDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, toAIMetadataDTO(&r))
	}
	httpx.OK(c, out)
}

// handleAIReprocess queues the AI processing again for an entry or a media
// asset.
func (s *Server) handleAIReprocess(c *gin.Context) {
	user := auth.CurrentUser(c)
	var payload struct {
		EntryID uint `json:"entryId"`
		MediaID uint `json:"mediaId"`
		All     bool `json:"all"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	if !s.cfg.AIConfigured() {
		httpx.Fail(c, http.StatusServiceUnavailable, &httpx.Error{
			Code:    "unavailable",
			Message: "no language model provider is configured on this server",
		})
		return
	}
	if !s.aiEnabled(user.ID) {
		httpx.Forbidden(c, "AI processing is turned off for your account")
		return
	}

	queued := 0
	switch {
	case payload.MediaID != 0:
		var asset models.MediaAsset
		if err := s.handle.DB().Where("id = ? AND user_id = ?", payload.MediaID, user.ID).
			First(&asset).Error; err != nil {
			httpx.NotFound(c, "media not found")
			return
		}
		if asset.Kind != models.MediaImage && asset.Kind != models.MediaLiveStill {
			httpx.ValidationError(c, "only still images can be described", nil)
			return
		}
		if err := s.enqueueImageDescription(user.ID, &asset); err != nil {
			httpx.Internal(c, s.log, err, "queue image description")
			return
		}
		queued++
	case payload.EntryID != 0:
		var entry models.Entry
		if err := s.handle.DB().Where("id = ? AND user_id = ?", payload.EntryID, user.ID).
			First(&entry).Error; err != nil {
			httpx.NotFound(c, "entry not found")
			return
		}
		s.scheduleEntrySummary(user.ID, &entry, entry.PlainText)
		queued++
		// Asking again about an entry means its pictures too, so one call
		// covers everything the panel shows.
		var pictures []models.MediaAsset
		s.handle.DB().Where("user_id = ? AND entry_id = ? AND kind IN ?", user.ID, entry.ID,
			[]string{models.MediaImage, models.MediaLiveStill}).Find(&pictures)
		for i := range pictures {
			if err := s.enqueueImageDescription(user.ID, &pictures[i]); err != nil {
				s.log.Warn("queue image description failed", "media", pictures[i].ID, "error", err)
				continue
			}
			queued++
		}
	case payload.All:
		var assets []models.MediaAsset
		s.handle.DB().Where("user_id = ? AND kind IN ?", user.ID,
			[]string{models.MediaImage, models.MediaLiveStill}).Find(&assets)
		for i := range assets {
			if err := s.enqueueImageDescription(user.ID, &assets[i]); err != nil {
				s.log.Warn("queue image description failed", "media", assets[i].ID, "error", err)
				continue
			}
			queued++
		}
	default:
		httpx.ValidationError(c, "nothing to process", map[string]string{
			"entryId": "provide an entry, a media asset or set all to true",
		})
		return
	}
	httpx.OK(c, gin.H{"queued": queued})
}

// handleAIPolish rewrites the text of a draft the way the writer asked. The
// answer comes back as plain text, so the writer can read it before it
// replaces anything.
func (s *Server) handleAIPolish(c *gin.Context) {
	user := auth.CurrentUser(c)
	var payload struct {
		Text        string `json:"text"`
		Instruction string `json:"instruction"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	text := strings.TrimSpace(payload.Text)
	if text == "" {
		httpx.ValidationError(c, "there is nothing to rewrite", map[string]string{
			"text": "write something first",
		})
		return
	}
	if len([]rune(text)) > 20000 {
		httpx.ValidationError(c, "the text is too long to rewrite", map[string]string{
			"text": "at most 20000 characters",
		})
		return
	}
	if !s.cfg.AIConfigured() {
		httpx.Fail(c, http.StatusServiceUnavailable, &httpx.Error{
			Code:    "unavailable",
			Message: "no language model provider is configured on this server",
		})
		return
	}
	// The rewriting is not part of the automatic processing, so it does not
	// wait for the switch that turns the summaries and the photo
	// descriptions on. The writer asked for it, right here.
	settings, err := s.loadSettings(user.ID)
	if err != nil {
		httpx.Internal(c, s.log, err, "load settings")
		return
	}
	polished, err := s.provider.PolishText(c.Request.Context(), text, ai.PolishOptions{
		Language:    settings.Language,
		Instruction: payload.Instruction,
	})
	if err != nil {
		httpx.Internal(c, s.log, err, "polish text")
		return
	}
	httpx.OK(c, gin.H{"text": polished, "original": text})
}

// scheduleImageDescriptions queues a description for every still picture of
// an entry that has not been looked at yet. A picture that already has a row
// is left alone, so saving an entry again does not pay for the model twice.
func (s *Server) scheduleImageDescriptions(userID, entryID uint) {
	if !s.cfg.AIConfigured() || !s.aiEnabled(userID) {
		return
	}
	var assets []models.MediaAsset
	if err := s.handle.DB().
		Where("user_id = ? AND entry_id = ? AND kind IN ?", userID, entryID,
			[]string{models.MediaImage, models.MediaLiveStill}).
		Find(&assets).Error; err != nil {
		s.log.Warn("load entry pictures failed", "entry", entryID, "error", err)
		return
	}
	if len(assets) == 0 {
		return
	}
	ids := make([]uint, 0, len(assets))
	for _, asset := range assets {
		ids = append(ids, asset.ID)
	}
	// A picture that was already looked at once is not sent again: the
	// answer is kept, and a picture that failed is retried through the
	// explicit reprocess call, not on every save of the entry.
	seen := map[uint]bool{}
	var rows []models.AIMetadata
	if err := s.handle.DB().
		Where("media_id IN ? AND kind = ?", ids, "image").
		Find(&rows).Error; err == nil {
		for _, row := range rows {
			if row.MediaID != nil {
				seen[*row.MediaID] = true
			}
		}
	}
	for i := range assets {
		if seen[assets[i].ID] {
			continue
		}
		if err := s.enqueueImageDescription(userID, &assets[i]); err != nil {
			s.log.Warn("queue image description failed", "media", assets[i].ID, "error", err)
		}
	}
}

// enqueueImageDescription creates the metadata record and schedules the job.
func (s *Server) enqueueImageDescription(userID uint, asset *models.MediaAsset) error {
	var meta models.AIMetadata
	err := s.handle.DB().Where("media_id = ? AND kind = ?", asset.ID, "image").First(&meta).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		meta = models.AIMetadata{
			UserID:  userID,
			MediaID: &asset.ID,
			EntryID: asset.EntryID,
			Kind:    "image",
			Status:  models.AIPending,
		}
		if err := s.handle.DB().Create(&meta).Error; err != nil {
			return err
		}
	} else if err != nil {
		return err
	} else {
		meta.Status = models.AIPending
		meta.Error = ""
		meta.UpdatedAt = time.Now().UTC()
		// The picture may have been put in an entry after it was first
		// looked at, and the entry page finds its notes by the entry.
		if asset.EntryID != nil {
			meta.EntryID = asset.EntryID
		}
		if err := s.handle.DB().Save(&meta).Error; err != nil {
			return err
		}
	}
	_, err = s.queue.EnqueueUnique(jobsDescribeImage, userID, asset.ID, nil)
	return err
}
