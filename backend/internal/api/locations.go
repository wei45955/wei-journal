package api

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

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

	out := make([]mapPlace, 0, len(locations))
	for _, l := range locations {
		place := mapPlace{
			ID:        l.ID,
			EntryID:   l.EntryID,
			MediaID:   l.MediaID,
			Name:      l.Name,
			Address:   l.Address,
			Latitude:  l.Latitude,
			Longitude: l.Longitude,
			Source:    l.Source,
			Status:    l.Status,
		}
		if l.EntryID != nil {
			if info, ok := titles[*l.EntryID]; ok {
				place.Title, _ = info["title"].(string)
				place.Date, _ = info["date"].(string)
			}
		}
		out = append(out, place)
	}
	httpx.OK(c, out)
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
		return tx.Create(&loc).Error
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

// handleGeocode searches for a place name. The provider is OpenStreetMap's
// Nominatim service, which is rate limited; the endpoint is therefore
// disabled unless it is explicitly enabled in the configuration.
func (s *Server) handleGeocode(c *gin.Context) {
	user := auth.CurrentUser(c)
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
	results, err := s.geocode(query)
	if err != nil {
		httpx.Internal(c, s.log, err, "geocode")
		return
	}
	_ = user
	httpx.OK(c, results)
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

var errGeocodeDisabled = errors.New("geocoding is disabled")

// geocodeEnabled reports whether the external place search may be used.
func (s *Server) geocodingEnabled() bool {
	return s.cfg.GeocodingEnabled
}

// geocode queries the configured Nominatim instance.
func (s *Server) geocode(query string) ([]geocodeResult, error) {
	if !s.geocodingEnabled() {
		return nil, errGeocodeDisabled
	}
	endpoint := s.cfg.GeocodingURL + "/search?format=jsonv2&limit=8&q=" + url.QueryEscape(query)
	req, err := http.NewRequest(http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", s.cfg.GeocodingUserAgent)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, errors.New("place search failed")
	}
	var raw []struct {
		DisplayName string `json:"display_name"`
		Lat         string `json:"lat"`
		Lon         string `json:"lon"`
	}
	if err := decodeJSONBody(resp.Body, &raw); err != nil {
		return nil, err
	}
	out := make([]geocodeResult, 0, len(raw))
	for _, r := range raw {
		lat, lon, ok := parseCoordinate(r.Lat, r.Lon)
		if !ok {
			continue
		}
		name := r.DisplayName
		if idx := strings.Index(name, ","); idx > 0 {
			name = name[:idx]
		}
		out = append(out, geocodeResult{
			Name:      strings.TrimSpace(name),
			Address:   r.DisplayName,
			Latitude:  lat,
			Longitude: lon,
		})
	}
	return out, nil
}
