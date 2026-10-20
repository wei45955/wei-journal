package api

import (
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/httpx"
	"github.com/wei/journal/backend/internal/media"
	"github.com/wei/journal/backend/internal/models"
)

// maxMultipartMemory bounds the in-memory part of a multipart upload.
const maxMultipartMemory = 16 << 20

func (s *Server) handleUploadMedia(c *gin.Context) {
	user := auth.CurrentUser(c)
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, s.cfg.MaxUploadBytes+maxMultipartMemory)

	form, err := c.MultipartForm()
	if err != nil {
		if isBodyTooLarge(err) {
			s.failTooLarge(c)
			return
		}
		httpx.ValidationError(c, "invalid upload", map[string]string{"file": "could not read the upload"})
		return
	}
	files := form.File["files"]
	if len(files) == 0 {
		files = form.File["file"]
	}
	if len(files) == 0 {
		httpx.ValidationError(c, "invalid upload", map[string]string{"file": "no file was provided"})
		return
	}

	created := make([]MediaDTO, 0, len(files))
	for _, fh := range files {
		asset, err := s.storeUpload(user, fh)
		if err != nil {
			if errors.Is(err, media.ErrTooLarge) {
				s.failTooLarge(c)
				return
			}
			httpx.Internal(c, s.log, err, "store upload")
			return
		}
		created = append(created, toMediaDTO(asset))
	}
	httpx.Created(c, created)
}

// handleUploadLivePhoto accepts a still image and its motion component and
// associates them as one logical Live Photo.
func (s *Server) handleUploadLivePhoto(c *gin.Context) {
	user := auth.CurrentUser(c)
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, s.cfg.MaxUploadBytes*2+maxMultipartMemory)

	form, err := c.MultipartForm()
	if err != nil {
		if isBodyTooLarge(err) {
			s.failTooLarge(c)
			return
		}
		httpx.ValidationError(c, "invalid upload", map[string]string{"file": "could not read the upload"})
		return
	}
	stillHeader := form.File["still"]
	motionHeader := form.File["motion"]
	if len(stillHeader) == 0 || len(motionHeader) == 0 {
		httpx.ValidationError(c, "invalid upload", map[string]string{
			"file": "both a still image and a motion file are required",
		})
		return
	}

	still, err := s.storeUpload(user, stillHeader[0])
	if err != nil {
		s.cleanupFailedUpload(still)
		httpx.Internal(c, s.log, err, "store live photo still")
		return
	}
	motion, err := s.storeUpload(user, motionHeader[0])
	if err != nil {
		s.cleanupFailedUpload(still)
		httpx.Internal(c, s.log, err, "store live photo motion")
		return
	}

	liveID := s.newLivePhotoID()
	now := time.Now().UTC()
	still.LivePhotoID = &liveID
	still.LiveRole = "still"
	still.Kind = models.MediaLiveStill
	motion.LivePhotoID = &liveID
	motion.LiveRole = "motion"
	motion.Kind = models.MediaLiveMotion
	if err := s.handle.DB().Model(&models.MediaAsset{}).Where("id IN ?", []uint{still.ID, motion.ID}).
		Updates(map[string]any{
			"live_photo_id": liveID,
			"live_role":     gorm.Expr("CASE WHEN id = ? THEN 'still' ELSE 'motion' END", still.ID),
			"kind":          gorm.Expr("CASE WHEN id = ? THEN ? ELSE ? END", still.ID, models.MediaLiveStill, models.MediaLiveMotion),
			"updated_at":    now,
		}).Error; err != nil {
		httpx.Internal(c, s.log, err, "link live photo")
		return
	}
	still.LivePhotoID = &liveID
	still.LiveRole = "still"
	still.Kind = models.MediaLiveStill
	motion.LivePhotoID = &liveID
	motion.LiveRole = "motion"
	motion.Kind = models.MediaLiveMotion

	httpx.Created(c, gin.H{
		"livePhotoId": liveID,
		"still":       toMediaDTO(still),
		"motion":      toMediaDTO(motion),
	})
}

// newLivePhotoID derives a group identifier for the components of a Live
// Photo. It is the media id of the still image, which keeps the pairing
// stable without an extra table.
func (s *Server) newLivePhotoID() uint {
	return uint(time.Now().UnixNano() & 0x7fffffff)
}

// failTooLarge reports an upload that did not fit through the door. The
// message names the limit, so the interface can tell the reader what to do
// instead of showing a bare failure.
func (s *Server) failTooLarge(c *gin.Context) {
	limitMB := s.cfg.MaxUploadBytes / (1024 * 1024)
	httpx.Fail(c, http.StatusRequestEntityTooLarge, &httpx.Error{
		Code:    httpx.CodePayload,
		Message: "the file is larger than the upload limit of " + strconv.FormatInt(limitMB, 10) + " MB",
		Details: map[string]string{"limitMB": strconv.FormatInt(limitMB, 10)},
	})
}

// isBodyTooLarge reports whether the request body was cut off because it
// passed the limit of the reader.
func isBodyTooLarge(err error) bool {
	if err == nil {
		return false
	}
	var tooLarge *http.MaxBytesError
	if errors.As(err, &tooLarge) {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "http: request body too large")
}

// storeUpload writes an uploaded file and records its metadata.
func (s *Server) storeUpload(user *models.User, fh *multipart.FileHeader) (*models.MediaAsset, error) {
	f, err := fh.Open()
	if err != nil {
		return nil, err
	}
	defer f.Close()

	head := make([]byte, 512)
	n, _ := io.ReadFull(f, head)
	head = head[:n]
	// Sniffing consumed the head of the stream. Rewind so the file is stored
	// in full; multipart files are always seekable.
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return nil, err
	}

	mime, ext, kind := media.Sniff(head, fh.Filename)
	if kind == media.KindImage && mime == "image/heic" {
		ext = ".heic"
	}

	saved, err := s.storage.Save(user.ID, f, ext)
	if err != nil {
		return nil, err
	}

	asset := &models.MediaAsset{
		UserID:       user.ID,
		Kind:         kind,
		OriginalName: sanitizeFilename(fh.Filename),
		StorageKey:   saved.StorageKey,
		StoredPath:   saved.StoredPath,
		MimeType:     mime,
		Size:         saved.Size,
		Hash:         saved.Hash,
		LiveRole:     "standalone",
	}
	if err := s.handle.DB().Create(asset).Error; err != nil {
		s.storage.RemoveUpload(saved.StoredPath)
		return nil, err
	}

	s.enrichAsset(asset)
	s.queue.EnqueueUnique(jobsBuildThumbnail, user.ID, asset.ID, nil)
	return asset, nil
}

// enrichAsset reads technical metadata from the stored file and, when the
// image carries GPS EXIF data, records the location.
func (s *Server) enrichAsset(asset *models.MediaAsset) {
	abs, err := s.storage.Absolute(asset.StoredPath)
	if err != nil {
		return
	}
	updates := map[string]any{}

	exifData, _ := media.ExtractExif(abs)
	if exifData.Marshal() != "" {
		updates["exif_json"] = exifData.Marshal()
	}
	if exifData.Latitude != nil && exifData.Longitude != nil {
		updates["gps_lat"] = *exifData.Latitude
		updates["gps_lon"] = *exifData.Longitude
		updates["location_src"] = "exif"
	}
	if asset.Kind == media.KindImage {
		if info, err := media.InspectImage(abs); err == nil {
			updates["width"] = info.Width
			updates["height"] = info.Height
		}
	}
	if len(updates) > 0 {
		updates["updated_at"] = time.Now().UTC()
		s.handle.DB().Model(&models.MediaAsset{}).Where("id = ?", asset.ID).Updates(updates)
		for k, v := range updates {
			switch k {
			case "width":
				asset.Width = v.(int)
			case "height":
				asset.Height = v.(int)
			case "gps_lat":
				asset.GPSLat = v.(*float64)
			case "gps_lon":
				asset.GPSLon = v.(*float64)
			case "location_src":
				asset.LocationSrc = v.(string)
			}
		}
	}
	// A GPS bearing image contributes its position to the parent entry when
	// the entry has no location of its own.
	if asset.GPSLat != nil {
		s.createLocationForAsset(asset)
	}
}

// createLocationForAsset records the position of an image that carried GPS
// metadata. It never overwrites a location the user chose explicitly.
func (s *Server) createLocationForAsset(asset *models.MediaAsset) {
	if asset.GPSLat == nil || asset.GPSLon == nil {
		return
	}
	loc := models.Location{
		UserID:    asset.UserID,
		MediaID:   &asset.ID,
		Name:      asset.LocationName,
		Latitude:  *asset.GPSLat,
		Longitude: *asset.GPSLon,
		Source:    "exif",
		Status:    "extracted",
	}
	if asset.EntryID != nil {
		var count int64
		s.handle.DB().Model(&models.Location{}).
			Where("entry_id = ? AND user_id = ?", *asset.EntryID, asset.UserID).
			Count(&count)
		if count == 0 {
			loc.EntryID = asset.EntryID
		}
	}
	s.handle.DB().Create(&loc)
}

func (s *Server) cleanupFailedUpload(asset *models.MediaAsset) {
	if asset == nil {
		return
	}
	s.storage.RemoveUpload(asset.StoredPath)
	s.handle.DB().Delete(&models.MediaAsset{}, asset.ID)
}

func (s *Server) handleListMedia(c *gin.Context) {
	user := auth.CurrentUser(c)
	q := s.handle.DB().Model(&models.MediaAsset{}).Where("user_id = ?", user.ID)
	if entryID := c.Query("entryId"); entryID != "" {
		if id, err := strconv.ParseUint(entryID, 10, 64); err == nil {
			q = q.Where("entry_id = ?", id)
		}
	}
	if kind := c.Query("kind"); kind != "" {
		q = q.Where("kind = ?", kind)
	}
	var assets []models.MediaAsset
	if err := q.Order("id DESC").Limit(200).Find(&assets).Error; err != nil {
		httpx.Internal(c, s.log, err, "list media")
		return
	}
	out := make([]MediaDTO, 0, len(assets))
	for _, a := range assets {
		out = append(out, toMediaDTO(&a))
	}
	httpx.OK(c, out)
}

func (s *Server) handleGetMedia(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "media not found")
		return
	}
	var asset models.MediaAsset
	err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&asset).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFound(c, "media not found")
			return
		}
		httpx.Internal(c, s.log, err, "get media")
		return
	}
	dto := toMediaDTO(&asset)
	var meta models.AIMetadata
	if err := s.handle.DB().Where("media_id = ? AND kind = ?", id, "image").First(&meta).Error; err == nil {
		dto.AIStatus = meta.Status
		dto.Description = meta.Description
	}
	httpx.OK(c, dto)
}

type mediaPatch struct {
	OriginalName *string  `json:"originalName"`
	EntryID      *uint    `json:"entryId"`
	Latitude     *float64 `json:"latitude"`
	Longitude    *float64 `json:"longitude"`
	LocationName *string  `json:"locationName"`
	Detach       bool     `json:"detach"`
	LiveRole     *string  `json:"liveRole"`
}

func (s *Server) handleUpdateMedia(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "media not found")
		return
	}
	var payload mediaPatch
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	var asset models.MediaAsset
	err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&asset).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFound(c, "media not found")
			return
		}
		httpx.Internal(c, s.log, err, "get media")
		return
	}
	updates := map[string]any{"updated_at": time.Now().UTC()}
	if payload.OriginalName != nil {
		updates["original_name"] = sanitizeFilename(*payload.OriginalName)
	}
	if payload.Detach {
		updates["entry_id"] = nil
		updates["attached"] = false
	} else if payload.EntryID != nil {
		var count int64
		s.handle.DB().Model(&models.Entry{}).
			Where("id = ? AND user_id = ?", *payload.EntryID, user.ID).Count(&count)
		if count == 0 {
			httpx.NotFound(c, "entry not found")
			return
		}
		updates["entry_id"] = *payload.EntryID
		updates["attached"] = true
	}
	if payload.Latitude != nil && payload.Longitude != nil {
		updates["gps_lat"] = *payload.Latitude
		updates["gps_lon"] = *payload.Longitude
		updates["location_src"] = "manual"
	}
	if payload.LocationName != nil {
		updates["location_name"] = *payload.LocationName
	}
	if err := s.handle.DB().Model(&models.MediaAsset{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		httpx.Internal(c, s.log, err, "update media")
		return
	}
	s.handle.DB().Where("id = ?", id).First(&asset)
	httpx.OK(c, toMediaDTO(&asset))
}

func (s *Server) handleDeleteMedia(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "media not found")
		return
	}
	var asset models.MediaAsset
	err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&asset).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFound(c, "media not found")
			return
		}
		httpx.Internal(c, s.log, err, "get media")
		return
	}
	if err := s.handle.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("media_id = ?", id).Delete(&models.Location{}).Error; err != nil {
			return err
		}
		if err := tx.Where("media_id = ?", id).Delete(&models.AIMetadata{}).Error; err != nil {
			return err
		}
		return tx.Delete(&models.MediaAsset{}, id).Error
	}); err != nil {
		httpx.Internal(c, s.log, err, "delete media")
		return
	}
	// The file itself is removed by the cleanup job.
	s.queue.Enqueue(jobsCleanupOrphans, user.ID, 0, map[string]any{"mediaId": id}, 0)
	httpx.NoContent(c)
}

// handleLinkLivePhoto pairs an existing still image with a motion file.
func (s *Server) handleLinkLivePhoto(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "media not found")
		return
	}
	var payload struct {
		MotionID uint `json:"motionId"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	var still, motion models.MediaAsset
	if err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&still).Error; err != nil {
		httpx.NotFound(c, "media not found")
		return
	}
	if err := s.handle.DB().Where("id = ? AND user_id = ?", payload.MotionID, user.ID).First(&motion).Error; err != nil {
		httpx.NotFound(c, "motion file not found")
		return
	}
	liveID := s.newLivePhotoID()
	err := s.handle.DB().Model(&models.MediaAsset{}).Where("id IN ?", []uint{still.ID, motion.ID}).
		Updates(map[string]any{
			"live_photo_id": liveID,
			"live_role":     gorm.Expr("CASE WHEN id = ? THEN 'still' ELSE 'motion' END", still.ID),
			"kind":          gorm.Expr("CASE WHEN id = ? THEN ? ELSE ? END", still.ID, models.MediaLiveStill, models.MediaLiveMotion),
			"updated_at":    time.Now().UTC(),
		}).Error
	if err != nil {
		httpx.Internal(c, s.log, err, "link live photo")
		return
	}
	httpx.OK(c, gin.H{"livePhotoId": liveID})
}

// serveAsset streams a stored file to the authenticated owner. Derived files
// live in their own tree, so the caller states which root the path is in.
func (s *Server) serveAsset(c *gin.Context, relPath, mime, name string, cacheControl string, derived bool) {
	var abs string
	var err error
	if derived {
		abs, err = s.storage.AbsoluteDerived(relPath)
	} else {
		abs, err = s.storage.Absolute(relPath)
	}
	if err != nil {
		httpx.NotFound(c, "file not found")
		return
	}
	f, err := os.Open(abs)
	if err != nil {
		httpx.NotFound(c, "file not found")
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.IsDir() {
		httpx.NotFound(c, "file not found")
		return
	}
	c.Writer.Header().Set("Content-Type", mime)
	c.Writer.Header().Set("Cache-Control", cacheControl)
	c.Writer.Header().Set("X-Content-Type-Options", "nosniff")
	// http.ServeContent handles range requests, which video players need.
	http.ServeContent(c.Writer, c.Request, name, info.ModTime(), f)
}

func (s *Server) handleMediaFile(c *gin.Context) {
	user := auth.CurrentUser(c)
	asset, ok := s.lookupAsset(c, user)
	if !ok {
		return
	}
	s.serveAsset(c, asset.StoredPath, asset.MimeType, asset.OriginalName, "private, max-age=3600", false)
}

func (s *Server) handleMediaThumb(c *gin.Context) {
	user := auth.CurrentUser(c)
	asset, ok := s.lookupAsset(c, user)
	if !ok {
		return
	}
	if asset.DerivedPath == "" {
		httpx.NotFound(c, "thumbnail not ready")
		return
	}
	s.serveAsset(c, asset.DerivedPath, "image/jpeg", "thumb.jpg", "private, max-age=86400", true)
}

func (s *Server) handleMediaPreview(c *gin.Context) {
	user := auth.CurrentUser(c)
	asset, ok := s.lookupAsset(c, user)
	if !ok {
		return
	}
	if asset.PreviewPath == "" {
		httpx.NotFound(c, "preview not ready")
		return
	}
	s.serveAsset(c, asset.PreviewPath, "image/jpeg", "preview.jpg", "private, max-age=86400", true)
}

func (s *Server) lookupAsset(c *gin.Context, user *models.User) (*models.MediaAsset, bool) {
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "media not found")
		return nil, false
	}
	var asset models.MediaAsset
	err := s.handle.DB().Where("id = ? AND user_id = ?", id, user.ID).First(&asset).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.NotFound(c, "media not found")
			return nil, false
		}
		httpx.Internal(c, s.log, err, "get media")
		return nil, false
	}
	return &asset, true
}

// sanitizeFilename keeps a display name safe without changing how it reads.
func sanitizeFilename(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, name)
	if name == "" || name == "." || name == ".." {
		return "file"
	}
	if len(name) > 255 {
		name = name[:255]
	}
	return name
}
