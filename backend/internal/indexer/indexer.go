// Package indexer keeps the full text search index in step with the data.
// Both the HTTP handlers and the background workers use it, so an entry is
// indexed the same way no matter which code path changed it.
package indexer

import (
	"encoding/json"
	"strings"

	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/journal"
	"github.com/wei/journal/backend/internal/models"
	"github.com/wei/journal/backend/internal/search"
)

// Indexer rebuilds the search documents of a single entry.
type Indexer struct {
	db     *gorm.DB
	search *search.Service
}

// New builds an indexer.
func New(db *gorm.DB, svc *search.Service) *Indexer {
	return &Indexer{db: db, search: svc}
}

// RebuildEntry collects every text source of an entry and replaces its
// indexed documents. Ownership is enforced by the user id, so an entry of
// another account is never touched.
func (i *Indexer) RebuildEntry(userID, entryID uint) error {
	var entry models.Entry
	if err := i.db.Where("id = ? AND user_id = ?", entryID, userID).First(&entry).Error; err != nil {
		return err
	}
	input := journal.BuildDocsInput{
		Title:     entry.Title,
		PlainText: entry.PlainText,
	}

	var entryTags []models.EntryTag
	if err := i.db.Where("entry_id = ?", entryID).Find(&entryTags).Error; err != nil {
		return err
	}
	tagIDs := make([]uint, 0, len(entryTags))
	for _, et := range entryTags {
		tagIDs = append(tagIDs, et.TagID)
	}
	if len(tagIDs) > 0 {
		var tags []models.Tag
		if err := i.db.Where("id IN ?", tagIDs).Find(&tags).Error; err != nil {
			return err
		}
		for _, t := range tags {
			input.TagNames = append(input.TagNames, t.Name)
		}
	}
	if entry.FolderID != nil {
		var folder models.Folder
		if err := i.db.Where("id = ? AND user_id = ?", *entry.FolderID, userID).
			First(&folder).Error; err == nil {
			input.FolderName = folder.Name
		}
	}

	var media []models.MediaAsset
	if err := i.db.Where("entry_id = ?", entryID).Find(&media).Error; err != nil {
		return err
	}
	mediaIDs := make([]uint, 0, len(media))
	for _, m := range media {
		mediaIDs = append(mediaIDs, m.ID)
		input.MediaNames = append(input.MediaNames, m.OriginalName)
		if m.LocationName != "" {
			input.Location += m.LocationName + " "
		}
	}
	if len(mediaIDs) > 0 {
		var aiRows []models.AIMetadata
		if err := i.db.Where("media_id IN ? AND kind = ?", mediaIDs, "image").Find(&aiRows).Error; err != nil {
			return err
		}
		for _, a := range aiRows {
			if a.MediaID == nil {
				continue
			}
			input.AIImageDesc = append(input.AIImageDesc, journal.MediaDescription{
				MediaID:     *a.MediaID,
				Description: a.Description,
			})
			input.AIKeywords = append(input.AIKeywords, decodeList(a.Keywords)...)
		}
	}

	var aiText []models.AIMetadata
	if err := i.db.Where("entry_id = ? AND kind = ?", entryID, "text").Find(&aiText).Error; err != nil {
		return err
	}
	for _, a := range aiText {
		input.AIText = append(input.AIText, a.Summary)
		input.AIKeywords = append(input.AIKeywords, decodeList(a.Keywords)...)
		input.AIKeywords = append(input.AIKeywords, decodeList(a.SuggestedTags)...)
	}

	var locs []models.Location
	if err := i.db.Where("entry_id = ?", entryID).Find(&locs).Error; err != nil {
		return err
	}
	for _, l := range locs {
		if l.Name != "" {
			input.Location += l.Name + " "
		}
	}

	return i.search.ReplaceEntryDocs(userID, entryID, journal.BuildDocs(input))
}

// RemoveEntry drops the indexed documents of an entry.
func (i *Indexer) RemoveEntry(userID, entryID uint) error {
	return i.search.RemoveEntryDocs(userID, entryID)
}

func decodeList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil
	}
	return out
}
