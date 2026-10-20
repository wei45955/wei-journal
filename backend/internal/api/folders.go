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

type folderPayload struct {
	Name  string `json:"name"`
	Color string `json:"color"`
	Icon  string `json:"icon"`
}

type reorderPayload struct {
	FolderIDs []uint `json:"folderIds"`
}

func (s *Server) handleListFolders(c *gin.Context) {
	user := auth.CurrentUser(c)
	var folders []models.Folder
	err := s.handle.DB().Where("user_id = ?", user.ID).
		Order("position ASC, name ASC").Find(&folders).Error
	if err != nil {
		httpx.Internal(c, s.log, err, "list folders")
		return
	}
	counts, err := s.folderCounts(user.ID)
	if err != nil {
		httpx.Internal(c, s.log, err, "count folder entries")
		return
	}
	out := make([]FolderDTO, 0, len(folders))
	for _, f := range folders {
		out = append(out, toFolderDTO(&f, counts[f.ID]))
	}
	httpx.OK(c, out)
}

func (s *Server) folderCounts(userID uint) (map[uint]int64, error) {
	counts := map[uint]int64{}
	var rows []struct {
		FolderID uint
		Total    int64
	}
	err := s.handle.DB().Model(&models.Entry{}).
		Select("folder_id, COUNT(*) as total").
		Where("user_id = ? AND folder_id IS NOT NULL", userID).
		Group("folder_id").Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		counts[r.FolderID] = r.Total
	}
	return counts, nil
}

func (s *Server) handleCreateFolder(c *gin.Context) {
	user := auth.CurrentUser(c)
	var payload folderPayload
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
	if len([]rune(name)) > 200 {
		httpx.ValidationError(c, "please check the highlighted fields", map[string]string{
			"name": "at most 200 characters",
		})
		return
	}

	var count int64
	s.handle.DB().Model(&models.Folder{}).Where("user_id = ? AND name = ?", user.ID, name).Count(&count)
	if count > 0 {
		httpx.Conflict(c, "a folder with that name already exists")
		return
	}

	var maxPos int64
	s.handle.DB().Model(&models.Folder{}).Where("user_id = ?", user.ID).Select("COALESCE(MAX(position), 0)").Scan(&maxPos)
	folder := models.Folder{
		UserID:   user.ID,
		Name:     name,
		Color:    payload.Color,
		Icon:     payload.Icon,
		Position: int(maxPos) + 1,
	}
	if err := s.handle.DB().Create(&folder).Error; err != nil {
		httpx.Internal(c, s.log, err, "create folder")
		return
	}
	httpx.Created(c, toFolderDTO(&folder, 0))
}

func (s *Server) handleUpdateFolder(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "folder not found")
		return
	}
	var payload folderPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	var folder models.Folder
	err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&folder).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFound(c, "folder not found")
			return
		}
		httpx.Internal(c, s.log, err, "get folder")
		return
	}
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		httpx.ValidationError(c, "please check the highlighted fields", map[string]string{
			"name": "a name is required",
		})
		return
	}
	var dup int64
	s.handle.DB().Model(&models.Folder{}).
		Where("user_id = ? AND name = ? AND id <> ?", user.ID, name, id).Count(&dup)
	if dup > 0 {
		httpx.Conflict(c, "a folder with that name already exists")
		return
	}
	folder.Name = name
	folder.Color = payload.Color
	folder.Icon = payload.Icon
	if err := s.handle.DB().Save(&folder).Error; err != nil {
		httpx.Internal(c, s.log, err, "update folder")
		return
	}
	counts, _ := s.folderCounts(user.ID)
	httpx.OK(c, toFolderDTO(&folder, counts[folder.ID]))
}

func (s *Server) handleDeleteFolder(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "folder not found")
		return
	}
	var folder models.Folder
	err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&folder).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFound(c, "folder not found")
			return
		}
		httpx.Internal(c, s.log, err, "get folder")
		return
	}

	strategy := c.DefaultQuery("strategy", "default")
	switch strategy {
	case "default":
		// Move the entries into the permanent default stream.
		err = s.handle.DB().Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&models.Entry{}).
				Where("folder_id = ? AND user_id = ?", id, user.ID).
				Update("folder_id", nil).Error; err != nil {
				return err
			}
			return tx.Delete(&models.Folder{}, id).Error
		})
		if err != nil {
			httpx.Internal(c, s.log, err, "delete folder")
			return
		}
		s.reindexFolderEntries(user.ID, id)
	case "delete":
		if c.Query("confirm") != "true" {
			httpx.ValidationError(c, "this action permanently deletes the folder and its entries", map[string]string{
				"confirm": "must be set to true to confirm",
			})
			return
		}
		var entryIDs []uint
		s.handle.DB().Model(&models.Entry{}).Where("folder_id = ? AND user_id = ?", id, user.ID).
			Pluck("id", &entryIDs)
		err = s.handle.DB().Transaction(func(tx *gorm.DB) error {
			if len(entryIDs) > 0 {
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
				if err := tx.Where("id IN ? AND user_id = ?", entryIDs, user.ID).Delete(&models.Entry{}).Error; err != nil {
					return err
				}
			}
			return tx.Delete(&models.Folder{}, id).Error
		})
		if err != nil {
			httpx.Internal(c, s.log, err, "delete folder and entries")
			return
		}
		for _, entryID := range entryIDs {
			s.queue.Enqueue(jobsCleanupOrphans, user.ID, 0, map[string]any{"entryId": entryID}, 0)
		}
	default:
		httpx.ValidationError(c, "unknown folder deletion strategy", map[string]string{
			"strategy": "must be either 'default' or 'delete'",
		})
		return
	}
	httpx.NoContent(c)
}

// reindexFolderEntries refreshes the search index of the entries that were
// moved out of a folder.
func (s *Server) reindexFolderEntries(userID, folderID uint) {
	var ids []uint
	s.handle.DB().Model(&models.Entry{}).Where("folder_id = ? AND user_id = ?", folderID, userID).Pluck("id", &ids)
	for _, id := range ids {
		if err := s.reindexEntry(userID, id); err != nil {
			s.log.Warn("reindex entry failed", "entry", id, "error", err)
		}
	}
}

func (s *Server) handleReorderFolders(c *gin.Context) {
	user := auth.CurrentUser(c)
	var payload reorderPayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	err := s.handle.DB().Transaction(func(tx *gorm.DB) error {
		for i, id := range payload.FolderIDs {
			if err := tx.Model(&models.Folder{}).
				Where("id = ? AND user_id = ?", id, user.ID).
				Update("position", i+1).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		httpx.Internal(c, s.log, err, "reorder folders")
		return
	}
	var folders []models.Folder
	s.handle.DB().Where("user_id = ?", user.ID).Order("position ASC, name ASC").Find(&folders)
	counts, _ := s.folderCounts(user.ID)
	out := make([]FolderDTO, 0, len(folders))
	for _, f := range folders {
		out = append(out, toFolderDTO(&f, counts[f.ID]))
	}
	httpx.OK(c, out)
}

// touchFolder keeps the folder updated_at fresh after a bulk change.
func touchFolder(db *gorm.DB, folderID uint) {
	db.Model(&models.Folder{}).Where("id = ?", folderID).Update("updated_at", time.Now().UTC())
}
