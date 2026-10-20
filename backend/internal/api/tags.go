package api

import (
	"errors"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/httpx"
	"github.com/wei/journal/backend/internal/models"
)

type tagPayload struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

func (s *Server) handleListTags(c *gin.Context) {
	user := auth.CurrentUser(c)
	q := s.handle.DB().Model(&models.Tag{}).Where("user_id = ?", user.ID)
	if term := strings.TrimSpace(c.Query("q")); term != "" {
		like := "%" + term + "%"
		q = q.Where("name LIKE ?", like)
	}
	var tags []models.Tag
	if err := q.Order("name ASC").Find(&tags).Error; err != nil {
		httpx.Internal(c, s.log, err, "list tags")
		return
	}
	counts, err := s.tagCounts(user.ID)
	if err != nil {
		httpx.Internal(c, s.log, err, "count tag entries")
		return
	}
	out := make([]TagDTO, 0, len(tags))
	for _, t := range tags {
		out = append(out, toTagDTO(&t, counts[t.ID]))
	}
	httpx.OK(c, out)
}

func (s *Server) tagCounts(userID uint) (map[uint]int64, error) {
	counts := map[uint]int64{}
	var rows []struct {
		TagID uint
		Total int64
	}
	err := s.handle.DB().Model(&models.EntryTag{}).
		Select("tag_id, COUNT(*) as total").
		Where("entry_id IN (SELECT id FROM entries WHERE user_id = ?)", userID).
		Group("tag_id").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		counts[r.TagID] = r.Total
	}
	return counts, nil
}

func (s *Server) handleCreateTag(c *gin.Context) {
	user := auth.CurrentUser(c)
	var payload tagPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		httpx.ValidationError(c, "please check the highlighted fields", map[string]string{
			"name": "a name is required",
		})
		return
	}
	if len([]rune(name)) > 120 {
		httpx.ValidationError(c, "please check the highlighted fields", map[string]string{
			"name": "at most 120 characters",
		})
		return
	}
	norm := NormalizeTagName(name)
	var count int64
	s.handle.DB().Model(&models.Tag{}).Where("user_id = ? AND normalized_name = ?", user.ID, norm).Count(&count)
	if count > 0 {
		httpx.Conflict(c, "a tag with that name already exists")
		return
	}
	tag := models.Tag{UserID: user.ID, Name: name, NormalizedName: norm, Color: payload.Color}
	if err := s.handle.DB().Create(&tag).Error; err != nil {
		if isUniqueViolation(err) {
			httpx.Conflict(c, "a tag with that name already exists")
			return
		}
		httpx.Internal(c, s.log, err, "create tag")
		return
	}
	httpx.Created(c, toTagDTO(&tag, 0))
}

func (s *Server) handleUpdateTag(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "tag not found")
		return
	}
	var payload tagPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	var tag models.Tag
	err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&tag).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFound(c, "tag not found")
			return
		}
		httpx.Internal(c, s.log, err, "get tag")
		return
	}
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		httpx.ValidationError(c, "please check the highlighted fields", map[string]string{
			"name": "a name is required",
		})
		return
	}
	norm := NormalizeTagName(name)
	var dup int64
	s.handle.DB().Model(&models.Tag{}).
		Where("user_id = ? AND normalized_name = ? AND id <> ?", user.ID, norm, id).Count(&dup)
	if dup > 0 {
		httpx.Conflict(c, "a tag with that name already exists")
		return
	}
	tag.Name = name
	tag.NormalizedName = norm
	tag.Color = payload.Color
	if err := s.handle.DB().Save(&tag).Error; err != nil {
		httpx.Internal(c, s.log, err, "update tag")
		return
	}
	// The tag name is indexed, so refresh the entries that use it.
	s.reindexTagEntries(user.ID, tag.ID)
	counts, _ := s.tagCounts(user.ID)
	httpx.OK(c, toTagDTO(&tag, counts[tag.ID]))
}

func (s *Server) handleDeleteTag(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "tag not found")
		return
	}
	var tag models.Tag
	err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&tag).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFound(c, "tag not found")
			return
		}
		httpx.Internal(c, s.log, err, "get tag")
		return
	}
	var entryIDs []uint
	s.handle.DB().Model(&models.EntryTag{}).Where("tag_id = ?", id).Pluck("entry_id", &entryIDs)
	err = s.handle.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tag_id = ?", id).Delete(&models.EntryTag{}).Error; err != nil {
			return err
		}
		return tx.Delete(&models.Tag{}, id).Error
	})
	if err != nil {
		httpx.Internal(c, s.log, err, "delete tag")
		return
	}
	for _, entryID := range entryIDs {
		if err := s.reindexEntry(user.ID, entryID); err != nil {
			s.log.Warn("reindex entry failed", "entry", entryID, "error", err)
		}
	}
	httpx.NoContent(c)
}

func (s *Server) reindexTagEntries(userID, tagID uint) {
	var entryIDs []uint
	s.handle.DB().Model(&models.EntryTag{}).Where("tag_id = ?", tagID).Pluck("entry_id", &entryIDs)
	for _, entryID := range entryIDs {
		if err := s.reindexEntry(userID, entryID); err != nil {
			s.log.Warn("reindex entry failed", "entry", entryID, "error", err)
		}
	}
}
