package api

import (
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/httpx"
	"github.com/wei/journal/backend/internal/models"
)

// mapPlace is a place the user can attach to an entry.
type mapPlace struct {
	ID        uint    `json:"id"`
	EntryID   *uint   `json:"entryId"`
	MediaID   *uint   `json:"mediaId"`
	Name      string  `json:"name"`
	Address   string  `json:"address"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Source    string  `json:"source"`
	Status    string  `json:"status"`
	Title     string  `json:"title"`
	Date      string  `json:"date"`
	MediaKind string  `json:"mediaKind"`
	// ThumbURL points at the photo taken here, when there is one and its
	// thumbnail has been generated. The map draws it as the marker.
	ThumbURL string `json:"thumbUrl"`
	// EntryCount is how many entries were written at this place, so one pin
	// can carry the number of memories that hang on it.
	EntryCount int `json:"entryCount"`
}

// placeKey identifies a place on the map. The coordinates are rounded to
// about a hundred metres, so the same cafe written down twice by hand still
// counts as one place.
type placeKey struct {
	latitude  float64
	longitude float64
	name      string
}

func placeKeyOf(l models.Location) placeKey {
	return placeKey{
		latitude:  math.Round(l.Latitude*1000) / 1000,
		longitude: math.Round(l.Longitude*1000) / 1000,
		name:      strings.TrimSpace(l.Name),
	}
}

// handleListLocations returns the places that can be shown on the map.
func (s *Server) handleListLocations(c *gin.Context) {
	user := auth.CurrentUser(c)
	q := s.handle.DB().Model(&models.Location{}).Where("locations.user_id = ?", user.ID)
	if from := c.Query("from"); from != "" {
		q = q.Where("locations.created_at >= ?", from)
	}
	if to := c.Query("to"); to != "" {
		q = q.Where("locations.created_at <= ?", to)
	}
	if folderID := c.Query("folderId"); folderID != "" {
		if folderID == "none" {
			q = q.Where("locations.entry_id IN (SELECT id FROM entries WHERE user_id = ? AND folder_id IS NULL)", user.ID)
		} else {
			q = q.Where("locations.entry_id IN (SELECT id FROM entries WHERE user_id = ? AND folder_id = ?)", user.ID, folderID)
		}
	}
	if tagIDs := httpx.QueryUintList(c, "tags"); len(tagIDs) > 0 {
		q = q.Where(`locations.entry_id IN (
			SELECT entry_id FROM entry_tags WHERE tag_id IN ?)`, tagIDs)
	}
	if c.Query("entryId") != "" {
		q = q.Where("locations.entry_id = ?", c.Query("entryId"))
	}

	var locations []models.Location
	if err := q.Order("locations.created_at DESC").Limit(1000).Find(&locations).Error; err != nil {
		httpx.Internal(c, s.log, err, "list locations")
		return
	}
	if len(locations) == 0 {
		httpx.OK(c, []mapPlace{})
		return
	}

	entryIDs := make([]uint, 0, len(locations))
	for _, l := range locations {
		if l.EntryID != nil {
			entryIDs = append(entryIDs, *l.EntryID)
		}
	}
	titles := map[uint]gin.H{}
	if len(entryIDs) > 0 {
		var entries []models.Entry
		if err := s.handle.DB().Where("user_id = ? AND id IN ?", user.ID, entryIDs).Find(&entries).Error; err == nil {
			for _, e := range entries {
				title := e.Title
				if title == "" {
					title = e.PlainText
					if len([]rune(title)) > 40 {
						title = string([]rune(title)[:40]) + "…"
					}
				}
				titles[e.ID] = gin.H{"title": title, "date": e.EventDate}
			}
		}
	}

	// The photo taken at a place, so the map can draw it as the marker.
	mediaIDs := make([]uint, 0, len(locations))
	for _, l := range locations {
		if l.MediaID != nil {
			mediaIDs = append(mediaIDs, *l.MediaID)
		}
	}
	type mediaInfo struct {
		kind     string
		thumbURL string
	}
	media := map[uint]mediaInfo{}
	if len(mediaIDs) > 0 {
		var assets []models.MediaAsset
		if err := s.handle.DB().Where("user_id = ? AND id IN ?", user.ID, mediaIDs).Find(&assets).Error; err == nil {
			for _, a := range assets {
				info := mediaInfo{kind: a.Kind}
				if a.DerivedPath != "" {
					info.thumbURL = "/api/media/" + itoa(a.ID) + "/thumb"
				}
				media[a.ID] = info
			}
		}
	}

	// How many entries hang on each place, so the pin can carry the number.
	placeCounts := map[placeKey]int{}
	for _, l := range locations {
		placeCounts[placeKeyOf(l)]++
	}

	out := make([]mapPlace, 0, len(locations))
	for _, l := range locations {
		place := mapPlace{
			ID:         l.ID,
			EntryID:    l.EntryID,
			MediaID:    l.MediaID,
			Name:       l.Name,
			Address:    l.Address,
			Latitude:   l.Latitude,
			Longitude:  l.Longitude,
			Source:     l.Source,
			Status:     l.Status,
			EntryCount: placeCounts[placeKeyOf(l)],
		}
		if l.EntryID != nil {
			if info, ok := titles[*l.EntryID]; ok {
				place.Title, _ = info["title"].(string)
				place.Date, _ = info["date"].(string)
			}
		}
		if l.MediaID != nil {
			if info, ok := media[*l.MediaID]; ok {
				place.MediaKind = info.kind
				place.ThumbURL = info.thumbURL
			}
		}
		out = append(out, place)
	}
	httpx.OK(c, out)
}

// linkPlacePhoto gives a place the photo taken there, so the map can draw
// the memory as a picture instead of a plain pin.
func linkPlacePhoto(tx *gorm.DB, userID uint, entryID uint) error {
	var mediaID uint
	err := tx.Model(&models.MediaAsset{}).
		Where("user_id = ? AND entry_id = ? AND kind = ?", userID, entryID, "image").
		Order("id ASC").
		Limit(1).
		Pluck("id", &mediaID).Error
	if err != nil {
		return err
	}
	if mediaID == 0 {
		return nil
	}
	return tx.Model(&models.Location{}).
		Where("user_id = ? AND entry_id = ? AND media_id IS NULL", userID, entryID).
		Update("media_id", mediaID).Error
}

// setEntryLocation stores or replaces the location of an entry.
func (s *Server) handleSetEntryLocation(c *gin.Context) {
	user := auth.CurrentUser(c)
	entryID, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "entry not found")
		return
	}
	var count int64
	s.handle.DB().Model(&models.Entry{}).Where("id = ? AND user_id = ?", entryID, user.ID).Count(&count)
	if count == 0 {
		httpx.NotFound(c, "entry not found")
		return
	}
	var payload struct {
		Latitude  float64 `json:"latitude"`
		Longitude float64 `json:"longitude"`
		Name      string  `json:"name"`
		Address   string  `json:"address"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	if payload.Latitude < -90 || payload.Latitude > 90 || payload.Longitude < -180 || payload.Longitude > 180 {
		httpx.ValidationError(c, "invalid coordinates", map[string]string{
			"latitude":  "must be between -90 and 90",
			"longitude": "must be between -180 and 180",
		})
		return
	}
	loc := models.Location{
		UserID:    user.ID,
		EntryID:   &entryID,
		Name:      strings.TrimSpace(payload.Name),
		Address:   strings.TrimSpace(payload.Address),
		Latitude:  payload.Latitude,
		Longitude: payload.Longitude,
		Source:    "manual",
		Status:    "confirmed",
	}
	err := s.handle.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("entry_id = ? AND user_id = ?", entryID, user.ID).
			Delete(&models.Location{}).Error; err != nil {
			return err
		}
		if err := tx.Create(&loc).Error; err != nil {
			return err
		}
		return linkPlacePhoto(tx, user.ID, entryID)
	})
	if err != nil {
		httpx.Internal(c, s.log, err, "set location")
		return
	}
	s.reindexEntry(user.ID, entryID)
	httpx.OK(c, toLocationDTO(&loc))
}

// handleDeleteEntryLocation removes the location of an entry.
func (s *Server) handleDeleteEntryLocation(c *gin.Context) {
	user := auth.CurrentUser(c)
	entryID, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "entry not found")
		return
	}
	err := s.handle.DB().Where("entry_id = ? AND user_id = ?", entryID, user.ID).
		Delete(&models.Location{}).Error
	if err != nil {
		httpx.Internal(c, s.log, err, "delete location")
		return
	}
	s.reindexEntry(user.ID, entryID)
	httpx.NoContent(c)
}

// geocodeResult is one suggestion from the place search.
type geocodeResult struct {
	Name      string  `json:"name"`
	Address   string  `json:"address"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

// handleGeocode searches for a place name. The service behind it is chosen
// in the configuration, so the journal works with the OpenStreetMap one out
// of the box and with a Chinese one when a key is given. The service is rate
// limited, so the search is off unless it is explicitly enabled.
func (s *Server) handleGeocode(c *gin.Context) {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		httpx.ValidationError(c, "invalid request body", map[string]string{
			"q": "a place name is required",
		})
		return
	}
	if !s.geocodingEnabled() {
		httpx.Fail(c, http.StatusServiceUnavailable, &httpx.Error{
			Code:    "unavailable",
			Message: "place search is not configured on this server",
		})
		return
	}
	places, err := s.geocoder.Search(c.Request.Context(), query, 8)
	if err != nil {
		httpx.Internal(c, s.log, err, "geocode")
		return
	}
	results := make([]geocodeResult, 0, len(places))
	for _, place := range places {
		results = append(results, geocodeResult{
			Name:      place.Name,
			Address:   place.Address,
			Latitude:  place.Latitude,
			Longitude: place.Longitude,
		})
	}
	httpx.OK(c, results)
}

// handleLocationCapabilities tells the interface what this installation can
// do. The place search is optional, and the dialog says so instead of
// pretending to work. The name of the service is given as well, so the map
// can offer the tiles that speak the same coordinate system.
func (s *Server) handleLocationCapabilities(c *gin.Context) {
	provider := "none"
	if s.geocoder != nil {
		provider = s.geocoder.Name()
	}
	httpx.OK(c, gin.H{"search": s.geocodingEnabled(), "provider": provider})
}

// handleReverseGeocode names a point. It needs the same optional service as
// the place search, so it answers with 503 when that service is off.
func (s *Server) handleReverseGeocode(c *gin.Context) {
	lat, err1 := strconv.ParseFloat(strings.TrimSpace(c.Query("lat")), 64)
	lon, err2 := strconv.ParseFloat(strings.TrimSpace(c.Query("lon")), 64)
	if err1 != nil || err2 != nil {
		httpx.ValidationError(c, "invalid request body", map[string]string{
			"lat": "the latitude and the longitude are required",
		})
		return
	}
	if !s.geocodingEnabled() {
		httpx.Fail(c, http.StatusServiceUnavailable, &httpx.Error{
			Code:    "unavailable",
			Message: "place search is not configured on this server",
		})
		return
	}
	place, err := s.geocoder.Reverse(c.Request.Context(), lat, lon)
	if err != nil {
		httpx.Internal(c, s.log, err, "reverse geocode")
		return
	}
	if place == nil {
		httpx.OK(c, []geocodeResult{})
		return
	}
	httpx.OK(c, []geocodeResult{{
		Name:      place.Name,
		Address:   place.Address,
		Latitude:  place.Latitude,
		Longitude: place.Longitude,
	}})
}

// handleSearchOwnLocations offers the user's own places as suggestions, which
// works without any external service.
func (s *Server) handleSearchOwnLocations(c *gin.Context) {
	user := auth.CurrentUser(c)
	query := strings.TrimSpace(c.Query("q"))
	q := s.handle.DB().Model(&models.Location{}).Where("user_id = ?", user.ID)
	if query != "" {
		q = q.Where("name LIKE ?", "%"+query+"%")
	}
	var locations []models.Location
	if err := q.Order("created_at DESC").Limit(20).Find(&locations).Error; err != nil {
		httpx.Internal(c, s.log, err, "search locations")
		return
	}
	out := make([]geocodeResult, 0, len(locations))
	for _, l := range locations {
		out = append(out, geocodeResult{
			Name:      l.Name,
			Address:   l.Address,
			Latitude:  l.Latitude,
			Longitude: l.Longitude,
		})
	}
	httpx.OK(c, out)
}

// geocodingEnabled reports whether the external place search may be used.
func (s *Server) geocodingEnabled() bool {
	if !s.cfg.GeocodingEnabled || s.geocoder == nil {
		return false
	}
	return s.geocoder.Available()
}
