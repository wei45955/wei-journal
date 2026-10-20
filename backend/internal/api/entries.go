package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/httpx"
	"github.com/wei/journal/backend/internal/journal"
	"github.com/wei/journal/backend/internal/models"
	"github.com/wei/journal/backend/internal/search"
)

// entryPayload is the request body for creating and updating an entry.
type entryPayload struct {
	// Title and Color are pointers so that "not sent" is distinguishable
	// from "sent as empty". A partial update must not clear a field the
	// caller never mentioned.
	Title     *string  `json:"title"`
	Document  string   `json:"document"`
	Drawing   string   `json:"drawing"`
	EventTime *string  `json:"eventTime"`
	Timezone  string   `json:"timezone"`
	FolderID  optionalID `json:"folderId"`
	TagIDs    []uint   `json:"tagIds"`
	TagNames  []string `json:"tagNames"`
	Color     *string  `json:"color"`
	IsPinned  *bool    `json:"isPinned"`
	MediaIDs  []uint   `json:"mediaIds"`
	Revision  *int     `json:"revision"`
}

// optionalID is an identifier that tells "not mentioned" apart from
// "mentioned as null". A plain *uint cannot do that: a missing field and an
// explicit null both decode into a nil pointer, so a partial update that
// only changes the tags would also clear the folder.
type optionalID struct {
	// Set is true when the field was present in the request body.
	Set bool
	// Value is the identifier, or nil when the field was null or zero.
	Value *uint
}

// UnmarshalJSON records whether the field was present and what it held.
func (o *optionalID) UnmarshalJSON(data []byte) error {
	if string(data) == "null" {
		o.Set = true
		o.Value = nil
		return nil
	}
	var v uint
	if err := json.Unmarshal(data, &v); err != nil {
		return err
	}
	o.Set = true
	if v == 0 {
		o.Value = nil
		return nil
	}
	o.Value = &v
	return nil
}

// MarshalJSON writes the identifier back, so the type can be used in
// responses as well.
func (o optionalID) MarshalJSON() ([]byte, error) {
	if o.Value == nil {
		return []byte("null"), nil
	}
	return json.Marshal(*o.Value)
}

type cursor struct {
	EventTime int64 `json:"t"`
	ID        uint  `json:"i"`
}

func encodeCursor(c cursor) string {
	b, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(b)
}

func decodeCursor(raw string) (cursor, bool) {
	if raw == "" {
		return cursor{}, false
	}
	b, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return cursor{}, false
	}
	var c cursor
	if err := json.Unmarshal(b, &c); err != nil {
		return cursor{}, false
	}
	return c, true
}

func (s *Server) handleListEntries(c *gin.Context) {
	user := auth.CurrentUser(c)
	q := s.handle.DB().Model(&models.Entry{}).Where("entries.user_id = ?", user.ID)

	if folderID := c.Query("folderId"); folderID != "" {
		if folderID == "none" {
			q = q.Where("entries.folder_id IS NULL")
		} else if id, err := strconv.ParseUint(folderID, 10, 64); err == nil {
			q = q.Where("entries.folder_id = ?", id)
		}
	}
	if tagIDs := httpx.QueryUintList(c, "tags"); len(tagIDs) > 0 {
		mode := c.DefaultQuery("tagMode", "any")
		if mode == "all" {
			q = q.Where(`entries.id IN (
				SELECT entry_id FROM entry_tags WHERE tag_id IN ? GROUP BY entry_id HAVING COUNT(DISTINCT tag_id) = ?)`,
				tagIDs, len(tagIDs))
		} else {
			q = q.Where(`entries.id IN (SELECT entry_id FROM entry_tags WHERE tag_id IN ?)`, tagIDs)
		}
	}
	if from := c.Query("from"); from != "" {
		q = q.Where("entries.event_date >= ?", from)
	}
	if to := c.Query("to"); to != "" {
		q = q.Where("entries.event_date <= ?", to)
	}
	if mediaType := c.Query("mediaType"); mediaType != "" {
		switch mediaType {
		case "image", "video", "audio", "file":
			q = q.Where(`entries.id IN (
				SELECT entry_id FROM media_assets
				WHERE deleted_at IS NULL AND entry_id IS NOT NULL AND kind = ?)`, mediaType)
		case "livephoto":
			q = q.Where(`entries.id IN (
				SELECT entry_id FROM media_assets
				WHERE deleted_at IS NULL AND entry_id IS NOT NULL AND live_photo_id IS NOT NULL)`)
		}
	}
	if pinned := c.Query("pinned"); pinned == "true" {
		q = q.Where("entries.is_pinned = ?", true)
	}
	if text := strings.TrimSpace(c.Query("q")); text != "" {
		ids, err := s.searchEntryIDs(user.ID, text)
		if err != nil {
			httpx.Internal(c, s.log, err, "search entries")
			return
		}
		if len(ids) == 0 {
			httpx.WithMeta(c, []EntryDTO{}, httpx.Meta{HasMore: false})
			return
		}
		q = q.Where("entries.id IN ?", ids)
	}

	limit := httpx.QueryInt(c, "limit", 30)
	if limit < 1 || limit > 100 {
		limit = 30
	}

	// Keyset pagination on (event_time, id) keeps the order stable while
	// new entries are being written.
	sortOrder := c.DefaultQuery("order", "desc")
	if c.Query("cursor") != "" {
		cur, ok := decodeCursor(c.Query("cursor"))
		if ok {
			if sortOrder == "asc" {
				q = q.Where("(entries.event_time, entries.id) > (?, ?)", time.Unix(0, cur.EventTime).UTC(), cur.ID)
			} else {
				q = q.Where("(entries.event_time, entries.id) < (?, ?)", time.Unix(0, cur.EventTime).UTC(), cur.ID)
			}
		}
	}
	if sortOrder == "asc" {
		q = q.Order("entries.event_time ASC, entries.id ASC")
	} else {
		q = q.Order("entries.event_time DESC, entries.id DESC")
	}

	var entries []models.Entry
	if err := q.Limit(limit + 1).Find(&entries).Error; err != nil {
		httpx.Internal(c, s.log, err, "list entries")
		return
	}
	hasMore := len(entries) > limit
	if hasMore {
		entries = entries[:limit]
	}

	dtos, err := s.buildEntryDTOs(user.ID, entries)
	if err != nil {
		httpx.Internal(c, s.log, err, "build entry payloads")
		return
	}
	meta := httpx.Meta{HasMore: hasMore, Limit: limit}
	if hasMore && len(entries) > 0 {
		last := entries[len(entries)-1]
		meta.NextCursor = encodeCursor(cursor{EventTime: last.EventTime.UnixNano(), ID: last.ID})
	}
	httpx.WithMeta(c, dtos, meta)
}

func (s *Server) handleCreateEntry(c *gin.Context) {
	user := auth.CurrentUser(c)
	var payload entryPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}

	eventTime := time.Now().UTC()
	if payload.EventTime != nil && *payload.EventTime != "" {
		parsed, err := time.Parse(time.RFC3339, *payload.EventTime)
		if err != nil {
			httpx.ValidationError(c, "invalid event time", map[string]string{
				"eventTime": "must be an RFC 3339 timestamp",
			})
			return
		}
		eventTime = parsed.UTC()
	}
	tz := payload.Timezone
	if tz == "" {
		tz = "UTC"
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		loc = time.UTC
		tz = "UTC"
	}

	folderID, err := s.resolveFolder(user.ID, payload.FolderID.Value)
	if err != nil {
		httpx.ValidationError(c, "invalid folder", map[string]string{"folderId": err.Error()})
		return
	}

	doc := journal.ParseDocument(payload.Document)
	plain := journal.ExtractText(doc)
	title := ""
	color := ""
	if payload.Title != nil {
		title = strings.TrimSpace(*payload.Title)
	}
	if payload.Color != nil {
		color = *payload.Color
	}
	entry := models.Entry{
		UserID:       user.ID,
		FolderID:     folderID,
		Title:        title,
		EventTime:    eventTime,
		EventDate:    eventTime.In(loc).Format("2006-01-02"),
		Timezone:     tz,
		DocumentJSON: journal.EncodeDocument(doc),
		DrawingJSON:  normalizeDrawing(payload.Drawing),
		PlainText:    plain,
		Color:        color,
		IsPinned:     payload.IsPinned != nil && *payload.IsPinned,
		WordCount:    journal.CountWords(plain),
		Revision:     1,
	}

	err = s.handle.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&entry).Error; err != nil {
			return err
		}
		if err := s.setEntryTags(tx, user.ID, &entry, payload.TagIDs, payload.TagNames); err != nil {
			return err
		}
		return s.attachMedia(tx, user.ID, &entry, payload.MediaIDs, doc)
	})
	if err != nil {
		httpx.Internal(c, s.log, err, "create entry")
		return
	}

	if err := s.reindexEntry(user.ID, entry.ID); err != nil {
		s.log.Warn("reindex after create failed", "entry", entry.ID, "error", err)
	}
	s.scheduleEntrySummary(user.ID, &entry, plain)

	dtos, err := s.buildEntryDTOs(user.ID, []models.Entry{entry})
	if err != nil {
		httpx.Internal(c, s.log, err, "build entry payload")
		return
	}
	httpx.Created(c, dtos[0])
}

func (s *Server) handleGetEntry(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "entry not found")
		return
	}
	var entry models.Entry
	err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&entry).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFound(c, "entry not found")
			return
		}
		httpx.Internal(c, s.log, err, "get entry")
		return
	}
	dtos, err := s.buildEntryDTOs(user.ID, []models.Entry{entry})
	if err != nil {
		httpx.Internal(c, s.log, err, "build entry payload")
		return
	}
	httpx.OK(c, dtos[0])
}

func (s *Server) handleUpdateEntry(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "entry not found")
		return
	}
	var payload entryPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}

	var entry models.Entry
	err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&entry).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFound(c, "entry not found")
			return
		}
		httpx.Internal(c, s.log, err, "get entry")
		return
	}
	if payload.Revision != nil && *payload.Revision != entry.Revision {
		// A newer revision exists; refuse the stale write so it cannot
		// silently overwrite newer content.
		httpx.Fail(c, 409, &httpx.Error{
			Code:    httpx.CodeConflict,
			Message: "this entry was updated elsewhere",
			Details: map[string]string{"currentRevision": strconv.Itoa(entry.Revision)},
		})
		return
	}

	updates := map[string]any{
		"revision":   entry.Revision + 1,
		"updated_at": time.Now().UTC(),
	}
	if payload.Title != nil {
		updates["title"] = strings.TrimSpace(*payload.Title)
	}
	if payload.Document != "" {
		doc := journal.ParseDocument(payload.Document)
		plain := journal.ExtractText(doc)
		updates["document_json"] = journal.EncodeDocument(doc)
		updates["plain_text"] = plain
		updates["word_count"] = journal.CountWords(plain)
	}
	if payload.Drawing != "" {
		updates["drawing_json"] = normalizeDrawing(payload.Drawing)
	}
	if payload.Color != nil {
		updates["color"] = *payload.Color
	}
	if payload.IsPinned != nil {
		updates["is_pinned"] = *payload.IsPinned
	}
	if payload.EventTime != nil && *payload.EventTime != "" {
		parsed, perr := time.Parse(time.RFC3339, *payload.EventTime)
		if perr != nil {
			httpx.ValidationError(c, "invalid event time", map[string]string{
				"eventTime": "must be an RFC 3339 timestamp",
			})
			return
		}
		tz := payload.Timezone
		if tz == "" {
			tz = entry.Timezone
		}
		loc, lerr := time.LoadLocation(tz)
		if lerr != nil {
			loc = time.UTC
			tz = "UTC"
		}
		updates["event_time"] = parsed.UTC()
		updates["event_date"] = parsed.UTC().In(loc).Format("2006-01-02")
		updates["timezone"] = tz
	}
	// Only a request that actually mentions the folder may change it. A
	// request that only changes the tags must leave the folder alone, and a
	// request that sends a null folder moves the entry back to the default
	// stream.
	if payload.FolderID.Set {
		folderID, ferr := s.resolveFolder(user.ID, payload.FolderID.Value)
		if ferr != nil {
			httpx.ValidationError(c, "invalid folder", map[string]string{"folderId": ferr.Error()})
			return
		}
		updates["folder_id"] = folderID
	}

	err = s.handle.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Entry{}).Where("id = ? AND user_id = ?", id, user.ID).
			Updates(updates).Error; err != nil {
			return err
		}
		if payload.TagIDs != nil || payload.TagNames != nil {
			if err := s.setEntryTags(tx, user.ID, &entry, payload.TagIDs, payload.TagNames); err != nil {
				return err
			}
		}
		if payload.MediaIDs != nil {
			doc := journal.ParseDocument(entry.DocumentJSON)
			if err := s.attachMedia(tx, user.ID, &entry, payload.MediaIDs, doc); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpx.Internal(c, s.log, err, "update entry")
		return
	}

	if err := s.handle.DB().Where("id = ?", id).First(&entry).Error; err != nil {
		httpx.Internal(c, s.log, err, "reload entry")
		return
	}
	if err := s.reindexEntry(user.ID, entry.ID); err != nil {
		s.log.Warn("reindex after update failed", "entry", entry.ID, "error", err)
	}
	// Only regenerate the summary when the written content actually changed.
	if payload.Document != "" {
		s.scheduleEntrySummary(user.ID, &entry, entry.PlainText)
	}

	dtos, err := s.buildEntryDTOs(user.ID, []models.Entry{entry})
	if err != nil {
		httpx.Internal(c, s.log, err, "build entry payload")
		return
	}
	httpx.OK(c, dtos[0])
}

func (s *Server) handleDeleteEntry(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "entry not found")
		return
	}
	var entry models.Entry
	err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&entry).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFound(c, "entry not found")
			return
		}
		httpx.Internal(c, s.log, err, "get entry")
		return
	}

	err = s.handle.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("entry_id = ?", id).Delete(&models.EntryTag{}).Error; err != nil {
			return err
		}
		if err := tx.Where("entry_id = ?", id).Delete(&models.Location{}).Error; err != nil {
			return err
		}
		if err := tx.Where("entry_id = ?", id).Delete(&models.AIMetadata{}).Error; err != nil {
			return err
		}
		if err := tx.Delete(&models.Entry{}, id).Error; err != nil {
			return err
		}
		return tx.Exec("DELETE FROM search_docs WHERE entry_id = ?", id).Error
	})
	if err != nil {
		httpx.Internal(c, s.log, err, "delete entry")
		return
	}

	// The media files are removed by the cleanup job so a transaction
	// failure can never leave a file that is still referenced.
	s.queue.Enqueue(jobsCleanupOrphans, user.ID, 0, map[string]any{"entryId": id}, 0)
	httpx.NoContent(c)
}

// resolveFolder validates that the folder belongs to the user.
func (s *Server) resolveFolder(userID uint, folderID *uint) (*uint, error) {
	if folderID == nil || *folderID == 0 {
		return nil, nil
	}
	var count int64
	err := s.handle.DB().Model(&models.Folder{}).
		Where("id = ? AND user_id = ?", *folderID, userID).Count(&count).Error
	if err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, errors.New("folder not found")
	}
	return folderID, nil
}

// setEntryTags replaces the tag associations of an entry.
func (s *Server) setEntryTags(tx *gorm.DB, userID uint, entry *models.Entry, tagIDs []uint, tagNames []string) error {
	if err := tx.Where("entry_id = ?", entry.ID).Delete(&models.EntryTag{}).Error; err != nil {
		return err
	}
	resolved := make([]uint, 0, len(tagIDs)+len(tagNames))
	for _, id := range tagIDs {
		var count int64
		if err := tx.Model(&models.Tag{}).Where("id = ? AND user_id = ?", id, userID).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			resolved = append(resolved, id)
		}
	}
	for _, raw := range tagNames {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		norm := NormalizeTagName(name)
		if norm == "" {
			continue
		}
		var tag models.Tag
		err := tx.Where("user_id = ? AND normalized_name = ?", userID, norm).First(&tag).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			tag = models.Tag{UserID: userID, Name: name, NormalizedName: norm}
			if err := tx.Create(&tag).Error; err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		resolved = append(resolved, tag.ID)
	}
	if len(resolved) == 0 {
		return nil
	}
	rows := make([]models.EntryTag, 0, len(resolved))
	seen := map[uint]bool{}
	for _, id := range resolved {
		if seen[id] {
			continue
		}
		seen[id] = true
		rows = append(rows, models.EntryTag{EntryID: entry.ID, TagID: id})
	}
	return tx.Create(&rows).Error
}

// attachMedia links uploaded media to an entry.
func (s *Server) attachMedia(tx *gorm.DB, userID uint, entry *models.Entry, mediaIDs []uint, doc journal.Document) error {
	ids := map[uint]bool{}
	for _, id := range mediaIDs {
		ids[id] = true
	}
	for _, id := range collectMediaIDs(doc) {
		ids[id] = true
	}
	if len(ids) == 0 {
		return nil
	}
	list := make([]uint, 0, len(ids))
	for id := range ids {
		list = append(list, id)
	}
	return tx.Model(&models.MediaAsset{}).
		Where("user_id = ? AND id IN ?", userID, list).
		Updates(map[string]any{
			"entry_id":   entry.ID,
			"attached":   true,
			"updated_at": time.Now().UTC(),
		}).Error
}

// collectMediaIDs finds the media assets referenced by a document.
func collectMediaIDs(doc journal.Document) []uint {
	var out []uint
	seen := map[uint]bool{}
	var walk func(nodes []journal.Node)
	walk = func(nodes []journal.Node) {
		for _, n := range nodes {
			if v, ok := n.Attrs["mediaId"].(float64); ok && v > 0 {
				id := uint(v)
				if !seen[id] {
					seen[id] = true
					out = append(out, id)
				}
			}
			walk(n.Content)
		}
	}
	walk(doc.Content)
	return out
}

// buildEntryDTOs loads the relations of the given entries in a fixed number
// of queries so the timeline never issues a query per entry.
func (s *Server) buildEntryDTOs(userID uint, entries []models.Entry) ([]EntryDTO, error) {
	if len(entries) == 0 {
		return []EntryDTO{}, nil
	}
	ids := make([]uint, 0, len(entries))
	index := map[uint]int{}
	for i, e := range entries {
		ids = append(ids, e.ID)
		index[e.ID] = i
	}
	out := make([]EntryDTO, len(entries))
	for i, e := range entries {
		out[i] = toEntryDTO(&e, []TagDTO{}, []MediaDTO{}, nil, []AIMetadataDTO{})
	}

	// Tags
	var entryTags []models.EntryTag
	if err := s.handle.DB().Where("entry_id IN ?", ids).Find(&entryTags).Error; err != nil {
		return nil, err
	}
	tagIDs := make([]uint, 0, len(entryTags))
	for _, et := range entryTags {
		tagIDs = append(tagIDs, et.TagID)
	}
	tagByID := map[uint]models.Tag{}
	if len(tagIDs) > 0 {
		var tags []models.Tag
		if err := s.handle.DB().Where("id IN ?", tagIDs).Find(&tags).Error; err != nil {
			return nil, err
		}
		for _, t := range tags {
			tagByID[t.ID] = t
		}
	}
	for _, et := range entryTags {
		t, ok := tagByID[et.TagID]
		if !ok {
			continue
		}
		pos := index[et.EntryID]
		out[pos].Tags = append(out[pos].Tags, toTagDTO(&t, 0))
	}
	for i := range out {
		sortTags(out[i].Tags)
	}

	// Media
	var media []models.MediaAsset
	if err := s.handle.DB().Where("entry_id IN ?", ids).Order("id ASC").Find(&media).Error; err != nil {
		return nil, err
	}
	aiByMedia := map[uint]models.AIMetadata{}
	var aiMediaIDs []uint
	for _, m := range media {
		aiMediaIDs = append(aiMediaIDs, m.ID)
	}
	if len(aiMediaIDs) > 0 {
		var aiRows []models.AIMetadata
		if err := s.handle.DB().Where("media_id IN ? AND kind = ?", aiMediaIDs, "image").Find(&aiRows).Error; err != nil {
			return nil, err
		}
		for _, a := range aiRows {
			if a.MediaID != nil {
				aiByMedia[*a.MediaID] = a
			}
		}
	}
	for _, m := range media {
		if m.EntryID == nil {
			continue
		}
		pos, ok := index[*m.EntryID]
		if !ok {
			continue
		}
		dto := toMediaDTO(&m)
		if a, ok := aiByMedia[m.ID]; ok {
			dto.AIStatus = a.Status
			dto.Description = a.Description
		}
		out[pos].Media = append(out[pos].Media, dto)
	}

	// Locations
	var locations []models.Location
	if err := s.handle.DB().Where("entry_id IN ?", ids).Find(&locations).Error; err != nil {
		return nil, err
	}
	for _, l := range locations {
		if l.EntryID == nil {
			continue
		}
		pos, ok := index[*l.EntryID]
		if !ok {
			continue
		}
		if out[pos].Location == nil {
			dto := toLocationDTO(&l)
			out[pos].Location = &dto
		}
	}

	// AI metadata for the entry text
	var aiRows []models.AIMetadata
	if err := s.handle.DB().Where("entry_id IN ?", ids).Find(&aiRows).Error; err != nil {
		return nil, err
	}
	for _, a := range aiRows {
		pos, ok := index[*a.EntryID]
		if !ok {
			continue
		}
		out[pos].AIMetadata = append(out[pos].AIMetadata, toAIMetadataDTO(&a))
	}

	// Folder names
	folderIDs := map[uint]bool{}
	for _, e := range entries {
		if e.FolderID != nil {
			folderIDs[*e.FolderID] = true
		}
	}
	if len(folderIDs) > 0 {
		list := make([]uint, 0, len(folderIDs))
		for id := range folderIDs {
			list = append(list, id)
		}
		var folders []models.Folder
		if err := s.handle.DB().Where("id IN ?", list).Find(&folders).Error; err != nil {
			return nil, err
		}
		names := map[uint]string{}
		for _, f := range folders {
			names[f.ID] = f.Name
		}
		for i, e := range entries {
			if e.FolderID != nil {
				out[i].FolderName = names[*e.FolderID]
			}
		}
	}
	return out, nil
}

func sortTags(tags []TagDTO) {
	sort.Slice(tags, func(i, j int) bool { return tags[i].Name < tags[j].Name })
}

// searchEntryIDs returns the entry ids matching a free text query.
func (s *Server) searchEntryIDs(userID uint, text string) ([]uint, error) {
	results, err := s.search.Search(userID, search.QueryOptions{Query: text, Limit: 500})
	if err != nil {
		return nil, err
	}
	seen := map[uint]bool{}
	ids := make([]uint, 0, len(results))
	for _, r := range results {
		if seen[r.EntryID] {
			continue
		}
		seen[r.EntryID] = true
		ids = append(ids, r.EntryID)
	}
	return ids, nil
}

// reindexEntry rebuilds the search documents of an entry.
func (s *Server) reindexEntry(userID, entryID uint) error {
	return s.index.RebuildEntry(userID, entryID)
}

// scheduleEntrySummary queues an AI summary when the written content changed.
func (s *Server) scheduleEntrySummary(userID uint, entry *models.Entry, plain string) {
	if strings.TrimSpace(plain) == "" {
		return
	}
	if !s.aiEnabled(userID) {
		return
	}
	sourceHash := hashText(plain)
	var existing models.AIMetadata
	err := s.handle.DB().Where("entry_id = ? AND kind = ?", entry.ID, "text").First(&existing).Error
	if err == nil && existing.SourceHash == sourceHash {
		return
	}
	if err == nil {
		existing.Status = models.AIPending
		existing.SourceHash = sourceHash
		existing.Error = ""
		existing.UpdatedAt = time.Now().UTC()
		s.handle.DB().Save(&existing)
	} else {
		existing = models.AIMetadata{
			UserID:     userID,
			EntryID:    &entry.ID,
			Kind:       "text",
			Status:     models.AIPending,
			SourceHash: sourceHash,
		}
		if err := s.handle.DB().Create(&existing).Error; err != nil {
			s.log.Warn("create ai metadata failed", "entry", entry.ID, "error", err)
			return
		}
	}
	s.queue.EnqueueUnique(jobsSummarizeText, userID, entry.ID, nil)
}

// aiEnabled reports whether the user opted into AI processing.
func (s *Server) aiEnabled(userID uint) bool {
	settings, err := s.loadSettings(userID)
	if err != nil {
		return false
	}
	return settings.AIEnabled
}

func hashText(s string) string {
	return fmt.Sprintf("%x", sha256Sum([]byte(s)))
}
