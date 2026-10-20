package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/httpx"
	"github.com/wei/journal/backend/internal/models"
)

// handleHealth is the liveness probe.
func (s *Server) handleHealth(c *gin.Context) {
	httpx.OK(c, gin.H{
		"status":  "ok",
		"version": s.version,
		"time":    time.Now().UTC(),
	})
}

// handleReady is the readiness probe; it checks the database connection.
func (s *Server) handleReady(c *gin.Context) {
	ctx, cancel := contextWithTimeout(c, 3*time.Second)
	defer cancel()
	if err := s.handle.SQL.PingContext(ctx); err != nil {
		httpx.Fail(c, http.StatusServiceUnavailable, &httpx.Error{
			Code:    "unavailable",
			Message: "the database is not reachable",
		})
		return
	}
	httpx.OK(c, gin.H{
		"status":  "ready",
		"version": s.version,
		"dialect": s.handle.Dialect,
	})
}

// handleExport returns the whole journal as a structured JSON document.
func (s *Server) handleExport(c *gin.Context) {
	user := auth.CurrentUser(c)
	includeMedia := c.Query("includeMedia") == "true"

	var entries []models.Entry
	if err := s.handle.DB().Where("user_id = ?", user.ID).
		Order("event_time ASC, id ASC").Find(&entries).Error; err != nil {
		httpx.Internal(c, s.log, err, "export entries")
		return
	}
	var folders []models.Folder
	s.handle.DB().Where("user_id = ?", user.ID).Order("position ASC").Find(&folders)
	var tags []models.Tag
	s.handle.DB().Where("user_id = ?", user.ID).Order("name ASC").Find(&tags)
	var media []models.MediaAsset
	s.handle.DB().Where("user_id = ?", user.ID).Order("id ASC").Find(&media)
	var locations []models.Location
	s.handle.DB().Where("user_id = ?", user.ID).Order("id ASC").Find(&locations)

	entryTags := map[uint][]string{}
	var rows []models.EntryTag
	s.handle.DB().Find(&rows)
	for _, r := range rows {
		var tag models.Tag
		if err := s.handle.DB().Where("id = ? AND user_id = ?", r.TagID, user.ID).First(&tag).Error; err == nil {
			entryTags[r.EntryID] = append(entryTags[r.EntryID], tag.Name)
		}
	}

	folderNames := map[uint]string{}
	for _, f := range folders {
		folderNames[f.ID] = f.Name
	}
	mediaByEntry := map[uint][]gin.H{}
	for _, m := range media {
		item := gin.H{
			"id":           m.ID,
			"kind":         m.Kind,
			"liveRole":     m.LiveRole,
			"livePhotoId":  m.LivePhotoID,
			"originalName": m.OriginalName,
			"mimeType":     m.MimeType,
			"size":         m.Size,
			"width":        m.Width,
			"height":       m.Height,
			"sha256":       m.Hash,
			"createdAt":    m.CreatedAt,
		}
		if includeMedia {
			item["url"] = "/api/media/" + itoa(m.ID) + "/file"
		}
		if m.EntryID != nil {
			mediaByEntry[*m.EntryID] = append(mediaByEntry[*m.EntryID], item)
		}
	}
	locationByEntry := map[uint][]gin.H{}
	for _, l := range locations {
		item := gin.H{
			"name": l.Name, "address": l.Address,
			"latitude": l.Latitude, "longitude": l.Longitude,
			"source": l.Source, "status": l.Status,
		}
		if l.EntryID != nil {
			locationByEntry[*l.EntryID] = append(locationByEntry[*l.EntryID], item)
		}
	}

	out := make([]gin.H, 0, len(entries))
	for _, e := range entries {
		item := gin.H{
			"id":        e.ID,
			"title":     e.Title,
			"eventTime": e.EventTime,
			"eventDate": e.EventDate,
			"timezone":  e.Timezone,
			"document":  rawJSON(e.DocumentJSON, `{"type":"doc","content":[]}`),
			"drawing":   rawJSON(e.DrawingJSON, `[]`),
			"plainText": e.PlainText,
			"color":     e.Color,
			"isPinned":  e.IsPinned,
			"wordCount": e.WordCount,
			"createdAt": e.CreatedAt,
			"updatedAt": e.UpdatedAt,
			"tags":      entryTags[e.ID],
			"media":     mediaByEntry[e.ID],
			"locations": locationByEntry[e.ID],
		}
		if e.FolderID != nil {
			item["folder"] = folderNames[*e.FolderID]
		}
		out = append(out, item)
	}

	folderOut := make([]gin.H, 0, len(folders))
	for _, f := range folders {
		folderOut = append(folderOut, gin.H{
			"id": f.ID, "name": f.Name, "color": f.Color, "position": f.Position,
		})
	}
	tagOut := make([]gin.H, 0, len(tags))
	for _, t := range tags {
		tagOut = append(tagOut, gin.H{"id": t.ID, "name": t.Name, "color": t.Color})
	}

	httpx.OK(c, gin.H{
		"formatVersion": 1,
		"exportedAt":    time.Now().UTC(),
		"includeMedia":  includeMedia,
		"folders":       folderOut,
		"tags":          tagOut,
		"entries":       out,
	})
}

// rawJSON returns the stored JSON when it is valid, and the fallback
// otherwise. An empty value would otherwise break the whole response.
func rawJSON(stored, fallback string) json.RawMessage {
	trimmed := strings.TrimSpace(stored)
	if trimmed == "" || !json.Valid([]byte(trimmed)) {
		return json.RawMessage(fallback)
	}
	return json.RawMessage(trimmed)
}
