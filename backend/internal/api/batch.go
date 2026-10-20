package api

import (
	"errors"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/httpx"
	"github.com/wei/journal/backend/internal/models"
)

// batchPayload describes a bulk operation over a set of entries.
type batchPayload struct {
	Action   string       `json:"action"`
	EntryIDs []uint       `json:"entryIds"`
	FolderID *uint        `json:"folderId"`
	TagIDs   []uint       `json:"tagIds"`
	TagNames []string     `json:"tagNames"`
	TagMode  string       `json:"tagMode"`
	Filter   *batchFilter `json:"filter"`
}

// batchFilter selects entries when no explicit list is given.
type batchFilter struct {
	FolderID   *uint  `json:"folderId"`
	TagIDs     []uint `json:"tagIds"`
	TagMode    string `json:"tagMode"`
	From       string `json:"from"`
	To         string `json:"to"`
	SearchText string `json:"q"`
}

// handleBatch applies a bulk operation.
func (s *Server) handleBatch(c *gin.Context) {
	user := auth.CurrentUser(c)
	var payload batchPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	ids, err := s.resolveBatchTargets(user.ID, payload)
	if err != nil {
		httpx.ValidationError(c, "invalid selection", map[string]string{"entryIds": err.Error()})
		return
	}
	if len(ids) == 0 {
		httpx.OK(c, gin.H{"affected": 0, "entryIds": []uint{}})
		return
	}

	switch payload.Action {
	case "moveToFolder":
		folderID, ferr := s.resolveFolder(user.ID, payload.FolderID)
		if ferr != nil {
			httpx.ValidationError(c, "invalid folder", map[string]string{"folderId": ferr.Error()})
			return
		}
		err = s.handle.DB().Model(&models.Entry{}).
			Where("id IN ? AND user_id = ?", ids, user.ID).
			Update("folder_id", folderID).Error
	case "moveToDefault":
		err = s.handle.DB().Model(&models.Entry{}).
			Where("id IN ? AND user_id = ?", ids, user.ID).
			Update("folder_id", nil).Error
	case "addTags":
		err = s.batchTags(user.ID, ids, payload, true)
	case "removeTags":
		err = s.batchTags(user.ID, ids, payload, false)
	case "delete":
		err = s.batchDelete(user.ID, ids)
	default:
		httpx.ValidationError(c, "unknown batch action", map[string]string{
			"action": "must be one of moveToFolder, moveToDefault, addTags, removeTags, delete",
		})
		return
	}
	if err != nil {
		httpx.Internal(c, s.log, err, "batch "+payload.Action)
		return
	}

	if payload.Action != "delete" {
		for _, id := range ids {
			if err := s.reindexEntry(user.ID, id); err != nil {
				s.log.Warn("reindex entry failed", "entry", id, "error", err)
			}
		}
	}
	httpx.OK(c, gin.H{"affected": len(ids), "entryIds": ids})
}

// handleBatchPreview reports how many entries a filter would select, so the
// client can warn before a destructive operation.
func (s *Server) handleBatchPreview(c *gin.Context) {
	user := auth.CurrentUser(c)
	var payload batchPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	ids, err := s.resolveBatchTargets(user.ID, payload)
	if err != nil {
		httpx.ValidationError(c, "invalid selection", map[string]string{"entryIds": err.Error()})
		return
	}
	httpx.OK(c, gin.H{"count": len(ids), "entryIds": ids})
}

// resolveBatchTargets returns the entries the operation applies to.
func (s *Server) resolveBatchTargets(userID uint, payload batchPayload) ([]uint, error) {
	if len(payload.EntryIDs) > 0 {
		var ids []uint
		err := s.handle.DB().Model(&models.Entry{}).
			Where("id IN ? AND user_id = ?", payload.EntryIDs, userID).
			Pluck("id", &ids).Error
		if err != nil {
			return nil, err
		}
		return ids, nil
	}
	if payload.Filter == nil {
		return nil, nil
	}
	q := s.handle.DB().Model(&models.Entry{}).Where("user_id = ?", userID)
	f := payload.Filter
	if f.FolderID != nil {
		if *f.FolderID == 0 {
			q = q.Where("folder_id IS NULL")
		} else {
			q = q.Where("folder_id = ?", *f.FolderID)
		}
	}
	if len(f.TagIDs) > 0 {
		if f.TagMode == "all" {
			q = q.Where(`id IN (SELECT entry_id FROM entry_tags WHERE tag_id IN ? GROUP BY entry_id HAVING COUNT(DISTINCT tag_id) = ?)`, f.TagIDs, len(f.TagIDs))
		} else {
			q = q.Where(`id IN (SELECT entry_id FROM entry_tags WHERE tag_id IN ?)`, f.TagIDs)
		}
	}
	if f.From != "" {
		q = q.Where("event_date >= ?", f.From)
	}
	if f.To != "" {
		q = q.Where("event_date <= ?", f.To)
	}
	if f.SearchText != "" {
		ids, err := s.searchEntryIDs(userID, f.SearchText)
		if err != nil {
			return nil, err
		}
		if len(ids) == 0 {
			return nil, nil
		}
		q = q.Where("id IN ?", ids)
	}
	var ids []uint
	if err := q.Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

// batchTags adds or removes tag associations across many entries.
func (s *Server) batchTags(userID uint, entryIDs []uint, payload batchPayload, add bool) error {
	tagIDs, err := s.resolveTagIDs(userID, payload.TagIDs, payload.TagNames)
	if err != nil {
		return err
	}
	if len(tagIDs) == 0 {
		return nil
	}
	return s.handle.DB().Transaction(func(tx *gorm.DB) error {
		for _, entryID := range entryIDs {
			if add {
				rows := make([]models.EntryTag, 0, len(tagIDs))
				for _, tagID := range tagIDs {
					rows = append(rows, models.EntryTag{EntryID: entryID, TagID: tagID})
				}
				if err := tx.Clauses(clauseOnConflictDoNothing()).Create(&rows).Error; err != nil {
					return err
				}
			} else {
				if err := tx.Where("entry_id = ? AND tag_id IN ?", entryID, tagIDs).
					Delete(&models.EntryTag{}).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// resolveTagIDs validates existing tags and creates the requested new ones.
func (s *Server) resolveTagIDs(userID uint, tagIDs []uint, tagNames []string) ([]uint, error) {
	out := make([]uint, 0, len(tagIDs)+len(tagNames))
	seen := map[uint]bool{}
	for _, id := range tagIDs {
		var count int64
		if err := s.handle.DB().Model(&models.Tag{}).
			Where("id = ? AND user_id = ?", id, userID).Count(&count).Error; err != nil {
			return nil, err
		}
		if count > 0 && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	for _, raw := range tagNames {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		norm := NormalizeTagName(name)
		var tag models.Tag
		err := s.handle.DB().Where("user_id = ? AND normalized_name = ?", userID, norm).First(&tag).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			tag = models.Tag{UserID: userID, Name: name, NormalizedName: norm}
			if err := s.handle.DB().Create(&tag).Error; err != nil {
				return nil, err
			}
		} else if err != nil {
			return nil, err
		}
		if !seen[tag.ID] {
			seen[tag.ID] = true
			out = append(out, tag.ID)
		}
	}
	return out, nil
}

// batchDelete removes entries and their dependent records.
func (s *Server) batchDelete(userID uint, entryIDs []uint) error {
	return s.handle.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("entry_id IN ?", entryIDs).Delete(&models.EntryTag{}).Error; err != nil {
			return err
		}
		if err := tx.Where("entry_id IN ?", entryIDs).Delete(&models.Location{}).Error; err != nil {
			return err
		}
		if err := tx.Where("entry_id IN ?", entryIDs).Delete(&models.AIMetadata{}).Error; err != nil {
			return err
		}
		if err := tx.Exec("DELETE FROM search_docs WHERE entry_id IN ?", entryIDs).Error; err != nil {
			return err
		}
		if err := tx.Where("id IN ? AND user_id = ?", entryIDs, userID).Delete(&models.Entry{}).Error; err != nil {
			return err
		}
		return nil
	})
}

// handleGetSettings returns the account preferences.
func (s *Server) handleGetSettings(c *gin.Context) {
	user := auth.CurrentUser(c)
	settings, err := s.loadSettings(user.ID)
	if err != nil {
		httpx.Internal(c, s.log, err, "load settings")
		return
	}
	httpx.OK(c, toSettingsDTO(settings))
}

type settingsPayload struct {
	Language   *string `json:"language"`
	Timezone   *string `json:"timezone"`
	Theme      *string `json:"theme"`
	DateFormat *string `json:"dateFormat"`
	AIEnabled  *bool   `json:"aiEnabled"`
	MapTileURL *string `json:"mapTileUrl"`
	// AlignZone is the concrete zone the calendar days should be rewritten
	// into. It is not stored. "auto" on the account follows the phone, and
	// the phone tells the server which zone that is right now.
	AlignZone *string `json:"alignZone"`
}

// handleUpdateSettings updates the account preferences.
func (s *Server) handleUpdateSettings(c *gin.Context) {
	user := auth.CurrentUser(c)
	var payload settingsPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	settings, err := s.loadSettings(user.ID)
	if err != nil {
		httpx.Internal(c, s.log, err, "load settings")
		return
	}
	if payload.Language != nil {
		switch *payload.Language {
		case "en", "zh-CN":
			settings.Language = *payload.Language
		default:
			httpx.ValidationError(c, "unsupported language", map[string]string{
				"language": "must be 'en' or 'zh-CN'",
			})
			return
		}
	}
	if payload.Timezone != nil {
		zone := strings.TrimSpace(*payload.Timezone)
		if zone == "" || zone == "auto" {
			settings.Timezone = "auto"
		} else if _, err := time.LoadLocation(zone); err != nil {
			httpx.ValidationError(c, "unknown timezone", map[string]string{
				"timezone": "must be a valid IANA timezone name",
			})
			return
		} else {
			settings.Timezone = zone
		}
	}
	alignZone := ""
	if payload.AlignZone != nil {
		alignZone = strings.TrimSpace(*payload.AlignZone)
	} else if payload.Timezone != nil && settings.Timezone != "auto" {
		alignZone = settings.Timezone
	}
	if alignZone != "" {
		if _, err := time.LoadLocation(alignZone); err != nil {
			httpx.ValidationError(c, "unknown timezone", map[string]string{
				"alignZone": "must be a valid IANA timezone name",
			})
			return
		}
	}
	if payload.Theme != nil {
		switch *payload.Theme {
		case "system", "light", "dark":
			settings.Theme = *payload.Theme
		default:
			httpx.ValidationError(c, "unsupported theme", map[string]string{
				"theme": "must be 'system', 'light' or 'dark'",
			})
			return
		}
	}
	if payload.DateFormat != nil {
		settings.DateFormat = *payload.DateFormat
	}
	if payload.AIEnabled != nil {
		if *payload.AIEnabled && !s.cfg.AIConfigured() {
			// The preference is stored but the interface reports the model
			// as unavailable, so the journal keeps working without it.
			s.log.Info("AI enabled by user but no provider is configured", "user", user.Username)
		}
		settings.AIEnabled = *payload.AIEnabled
	}
	if payload.MapTileURL != nil {
		settings.MapTileURL = *payload.MapTileURL
	}
	if err := s.handle.DB().Save(settings).Error; err != nil {
		httpx.Internal(c, s.log, err, "update settings")
		return
	}
	if alignZone != "" {
		if err := s.alignEntryDays(user.ID, alignZone); err != nil {
			httpx.Internal(c, s.log, err, "align entry days")
			return
		}
	}
	httpx.OK(c, toSettingsDTO(settings))
}

// alignEntryDays rewrites each entry's calendar day into zone. The instant
// stays in UTC; only the civil date and the zone label move.
func (s *Server) alignEntryDays(userID uint, zone string) error {
	loc, err := time.LoadLocation(zone)
	if err != nil {
		return err
	}
	var entries []models.Entry
	if err := s.handle.DB().Where("user_id = ?", userID).Find(&entries).Error; err != nil {
		return err
	}
	for _, entry := range entries {
		date := entry.EventTime.UTC().In(loc).Format("2006-01-02")
		if date == entry.EventDate && entry.Timezone == zone {
			continue
		}
		err := s.handle.DB().Model(&models.Entry{}).Where("id = ?", entry.ID).Updates(map[string]any{
			"event_date": date,
			"timezone":   zone,
		}).Error
		if err != nil {
			return err
		}
	}
	return nil
}
