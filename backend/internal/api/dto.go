package api

import (
	"encoding/json"
	"time"

	"github.com/wei/journal/backend/internal/journal"
	"github.com/wei/journal/backend/internal/models"
)

// UserDTO is the public representation of an account.
type UserDTO struct {
	ID          uint        `json:"id"`
	Username    string      `json:"username"`
	Email       string      `json:"email"`
	Role        string      `json:"role"`
	CreatedAt   time.Time   `json:"createdAt"`
	LastLoginAt *time.Time  `json:"lastLoginAt,omitempty"`
	Settings    SettingsDTO `json:"settings"`
}

// SettingsDTO exposes the account preferences.
type SettingsDTO struct {
	Language   string `json:"language"`
	Timezone   string `json:"timezone"`
	Theme      string `json:"theme"`
	DateFormat string `json:"dateFormat"`
	AIEnabled  bool   `json:"aiEnabled"`
	MapTileURL string `json:"mapTileUrl"`
}

// FolderDTO is a folder plus its entry count.
type FolderDTO struct {
	ID         uint      `json:"id"`
	Name       string    `json:"name"`
	Color      string    `json:"color"`
	Icon       string    `json:"icon"`
	Position   int       `json:"position"`
	EntryCount int64     `json:"entryCount"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// TagDTO is a tag plus its entry count.
type TagDTO struct {
	ID         uint      `json:"id"`
	Name       string    `json:"name"`
	Color      string    `json:"color"`
	EntryCount int64     `json:"entryCount"`
	CreatedAt  time.Time `json:"createdAt"`
}

// EntryDTO is a journal entry with its related records.
type EntryDTO struct {
	ID         uint            `json:"id"`
	FolderID   *uint           `json:"folderId"`
	Title      string          `json:"title"`
	EventTime  time.Time       `json:"eventTime"`
	EventDate  string          `json:"eventDate"`
	Timezone   string          `json:"timezone"`
	Document   json.RawMessage `json:"document"`
	Drawing    json.RawMessage `json:"drawing"`
	PlainText  string          `json:"plainText"`
	Color      string          `json:"color"`
	IsPinned   bool            `json:"isPinned"`
	WordCount  int             `json:"wordCount"`
	Revision   int             `json:"revision"`
	CreatedAt  time.Time       `json:"createdAt"`
	UpdatedAt  time.Time       `json:"updatedAt"`
	Tags       []TagDTO        `json:"tags"`
	Media      []MediaDTO      `json:"media"`
	Location   *LocationDTO    `json:"location"`
	AIMetadata []AIMetadataDTO `json:"aiMetadata"`
	FolderName string          `json:"folderName,omitempty"`
}

// MediaDTO is an uploaded asset with ready to use URLs.
type MediaDTO struct {
	ID             uint      `json:"id"`
	EntryID        *uint     `json:"entryId"`
	LivePhotoID    *uint     `json:"livePhotoId"`
	LiveRole       string    `json:"liveRole"`
	Kind           string    `json:"kind"`
	OriginalName   string    `json:"originalName"`
	MimeType       string    `json:"mimeType"`
	Size           int64     `json:"size"`
	Width          int       `json:"width"`
	Height         int       `json:"height"`
	DurationMs     int       `json:"durationMs"`
	URL            string    `json:"url"`
	ThumbURL       string    `json:"thumbUrl"`
	PreviewURL     string    `json:"previewUrl"`
	HasThumb       bool      `json:"hasThumb"`
	HasPreview     bool      `json:"hasPreview"`
	Latitude       *float64  `json:"latitude"`
	Longitude      *float64  `json:"longitude"`
	LocationName   string    `json:"locationName"`
	LocationSource string    `json:"locationSource"`
	AIStatus       string    `json:"aiStatus"`
	Description    string    `json:"description"`
	CreatedAt      time.Time `json:"createdAt"`
}

// LocationDTO is a geographic point.
type LocationDTO struct {
	ID        uint      `json:"id"`
	EntryID   *uint     `json:"entryId"`
	MediaID   *uint     `json:"mediaId"`
	Name      string    `json:"name"`
	Address   string    `json:"address"`
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	Source    string    `json:"source"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

// AIMetadataDTO is derived, AI generated information.
type AIMetadataDTO struct {
	ID            uint      `json:"id"`
	EntryID       *uint     `json:"entryId"`
	MediaID       *uint     `json:"mediaId"`
	Kind          string    `json:"kind"`
	Status        string    `json:"status"`
	Description   string    `json:"description"`
	Summary       string    `json:"summary"`
	Keywords      []string  `json:"keywords"`
	SuggestedTags []string  `json:"suggestedTags"`
	Model         string    `json:"model"`
	Error         string    `json:"error,omitempty"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// SessionDTO describes an active session.
type SessionDTO struct {
	ID         uint      `json:"id"`
	Current    bool      `json:"current"`
	UserAgent  string    `json:"userAgent"`
	IP         string    `json:"ip"`
	CreatedAt  time.Time `json:"createdAt"`
	LastSeenAt time.Time `json:"lastSeenAt"`
	ExpiresAt  time.Time `json:"expiresAt"`
}

func toUserDTO(u *models.User, settings *models.UserSettings) UserDTO {
	dto := UserDTO{
		ID:          u.ID,
		Username:    u.Username,
		Email:       u.Email,
		Role:        u.Role,
		CreatedAt:   u.CreatedAt,
		LastLoginAt: u.LastLoginAt,
	}
	if settings != nil {
		dto.Settings = SettingsDTO{
			Language:   settings.Language,
			Timezone:   settings.Timezone,
			Theme:      settings.Theme,
			DateFormat: settings.DateFormat,
			AIEnabled:  settings.AIEnabled,
			MapTileURL: settings.MapTileURL,
		}
	}
	return dto
}

func toSettingsDTO(s *models.UserSettings) SettingsDTO {
	return SettingsDTO{
		Language:   s.Language,
		Timezone:   s.Timezone,
		Theme:      s.Theme,
		DateFormat: s.DateFormat,
		AIEnabled:  s.AIEnabled,
		MapTileURL: s.MapTileURL,
	}
}

func toFolderDTO(f *models.Folder, count int64) FolderDTO {
	return FolderDTO{
		ID:         f.ID,
		Name:       f.Name,
		Color:      f.Color,
		Icon:       f.Icon,
		Position:   f.Position,
		EntryCount: count,
		CreatedAt:  f.CreatedAt,
		UpdatedAt:  f.UpdatedAt,
	}
}

func toTagDTO(t *models.Tag, count int64) TagDTO {
	return TagDTO{
		ID:         t.ID,
		Name:       t.Name,
		Color:      t.Color,
		EntryCount: count,
		CreatedAt:  t.CreatedAt,
	}
}

func toMediaDTO(m *models.MediaAsset) MediaDTO {
	return MediaDTO{
		ID:             m.ID,
		EntryID:        m.EntryID,
		LivePhotoID:    m.LivePhotoID,
		LiveRole:       m.LiveRole,
		Kind:           m.Kind,
		OriginalName:   m.OriginalName,
		MimeType:       m.MimeType,
		Size:           m.Size,
		Width:          m.Width,
		Height:         m.Height,
		DurationMs:     m.DurationMs,
		URL:            "/api/media/" + itoa(m.ID) + "/file",
		ThumbURL:       "/api/media/" + itoa(m.ID) + "/thumb",
		PreviewURL:     "/api/media/" + itoa(m.ID) + "/preview",
		HasThumb:       m.DerivedPath != "",
		HasPreview:     m.PreviewPath != "",
		Latitude:       m.GPSLat,
		Longitude:      m.GPSLon,
		LocationName:   m.LocationName,
		LocationSource: m.LocationSrc,
		CreatedAt:      m.CreatedAt,
	}
}

func toLocationDTO(l *models.Location) LocationDTO {
	return LocationDTO{
		ID:        l.ID,
		EntryID:   l.EntryID,
		MediaID:   l.MediaID,
		Name:      l.Name,
		Address:   l.Address,
		Latitude:  l.Latitude,
		Longitude: l.Longitude,
		Source:    l.Source,
		Status:    l.Status,
		CreatedAt: l.CreatedAt,
	}
}

func toAIMetadataDTO(m *models.AIMetadata) AIMetadataDTO {
	return AIMetadataDTO{
		ID:            m.ID,
		EntryID:       m.EntryID,
		MediaID:       m.MediaID,
		Kind:          m.Kind,
		Status:        m.Status,
		Description:   m.Description,
		Summary:       m.Summary,
		Keywords:      decodeList(m.Keywords),
		SuggestedTags: decodeList(m.SuggestedTags),
		Model:         m.Model,
		Error:         m.Error,
		UpdatedAt:     m.UpdatedAt,
	}
}

func toSessionDTO(s *models.Session, currentID uint) SessionDTO {
	return SessionDTO{
		ID:         s.ID,
		Current:    s.ID == currentID,
		UserAgent:  s.UserAgent,
		IP:         s.IP,
		CreatedAt:  s.CreatedAt,
		LastSeenAt: s.LastSeenAt,
		ExpiresAt:  s.ExpiresAt,
	}
}

// toEntryDTO converts an entry, using the pre-loaded relations.
func toEntryDTO(e *models.Entry, tags []TagDTO, media []MediaDTO, loc *LocationDTO, aiMeta []AIMetadataDTO) EntryDTO {
	doc := rawJSON(e.DocumentJSON, `{"type":"doc","content":[]}`)
	drawing := rawJSON(e.DrawingJSON, `[]`)
	return EntryDTO{
		ID:         e.ID,
		FolderID:   e.FolderID,
		Title:      e.Title,
		EventTime:  e.EventTime,
		EventDate:  e.EventDate,
		Timezone:   e.Timezone,
		Document:   doc,
		Drawing:    drawing,
		PlainText:  e.PlainText,
		Color:      e.Color,
		IsPinned:   e.IsPinned,
		WordCount:  e.WordCount,
		Revision:   e.Revision,
		CreatedAt:  e.CreatedAt,
		UpdatedAt:  e.UpdatedAt,
		Tags:       tags,
		Media:      media,
		Location:   loc,
		AIMetadata: aiMeta,
	}
}

func decodeList(raw string) []string {
	if raw == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil || out == nil {
		return []string{}
	}
	return out
}

func encodeList(items []string) string {
	if items == nil {
		items = []string{}
	}
	b, err := json.Marshal(items)
	if err != nil {
		return "[]"
	}
	return string(b)
}

func itoa(v uint) string {
	if v == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}

// documentFromJSON decodes a stored document into the shared node type.
func documentFromJSON(raw string) journal.Document {
	return journal.ParseDocument(raw)
}
