package models

import (
	"time"

	"gorm.io/gorm"
)

// Roles recognised by the application.
const (
	RoleUser  = "user"
	RoleAdmin = "admin"
)

// Media kinds.
const (
	MediaImage        = "image"
	MediaVideo        = "video"
	MediaAudio        = "audio"
	MediaFile         = "file"
	MediaLiveStill    = "livephoto_still"
	MediaLiveMotion   = "livephoto_motion"
	MediaLiveExtras   = "livephoto"
	MediaDocumentType = "document"
)

// User is a journal owner. Every other record carries a UserID so ownership
// can be enforced on every query.
type User struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Username     string         `gorm:"size:64;not null;uniqueIndex" json:"username"`
	Email        string         `gorm:"size:255;not null;default:''" json:"email"`
	PasswordHash string         `gorm:"size:255;not null" json:"-"`
	Role         string         `gorm:"size:16;not null;default:'user'" json:"role"`
	Disabled     bool           `gorm:"not null;default:false" json:"disabled"`
	LastLoginAt  *time.Time     `json:"lastLoginAt,omitempty"`
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
	Settings     *UserSettings  `gorm:"foreignKey:UserID" json:"settings,omitempty"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

// UserSettings holds per-account preferences.
type UserSettings struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	UserID     uint           `gorm:"not null;uniqueIndex" json:"userId"`
	Language   string         `gorm:"size:16;not null;default:'en'" json:"language"`
	Timezone   string         `gorm:"size:64;not null;default:'UTC'" json:"timezone"`
	Theme      string         `gorm:"size:16;not null;default:'system'" json:"theme"`
	DateFormat string         `gorm:"size:32;not null;default:'YYYY-MM-DD'" json:"dateFormat"`
	AIEnabled  bool           `gorm:"not null;default:false" json:"aiEnabled"`
	MapTileURL string         `gorm:"size:512;not null;default:''" json:"mapTileUrl"`
	CreatedAt  time.Time      `json:"createdAt"`
	UpdatedAt  time.Time      `json:"updatedAt"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`
}

// Folder groups entries. A nil FolderID means the entry lives in the
// permanent default stream.
type Folder struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"not null;index:idx_folder_user" json:"userId"`
	Name      string         `gorm:"size:200;not null" json:"name"`
	Color     string         `gorm:"size:32;not null;default:''" json:"color"`
	Position  int            `gorm:"not null;default:0;index:idx_folder_user_pos" json:"position"`
	Icon      string         `gorm:"size:64;not null;default:''" json:"icon"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// Tag is a user managed label shared by many entries.
type Tag struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	UserID         uint           `gorm:"not null;index:idx_tag_user" json:"userId"`
	Name           string         `gorm:"size:120;not null" json:"name"`
	NormalizedName string         `gorm:"size:120;not null;uniqueIndex:idx_tag_user_norm" json:"normalizedName"`
	Color          string         `gorm:"size:32;not null;default:''" json:"color"`
	CreatedAt      time.Time      `json:"createdAt"`
	UpdatedAt      time.Time      `json:"updatedAt"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

// EntryTag is the many-to-many bridge between entries and tags.
type EntryTag struct {
	EntryID   uint      `gorm:"primaryKey" json:"entryId"`
	TagID     uint      `gorm:"primaryKey;index" json:"tagId"`
	CreatedAt time.Time `json:"createdAt"`
}

// Entry is a single journal record.
type Entry struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	UserID       uint           `gorm:"not null;index:idx_entry_user_time" json:"userId"`
	FolderID     *uint          `gorm:"index:idx_entry_folder" json:"folderId,omitempty"`
	Title        string         `gorm:"size:300;not null;default:''" json:"title"`
	EventTime    time.Time      `gorm:"not null;index:idx_entry_user_time" json:"eventTime"`
	EventDate    string         `gorm:"size:10;not null;index:idx_entry_user_date" json:"eventDate"`
	Timezone     string         `gorm:"size:64;not null;default:'UTC'" json:"timezone"`
	DocumentJSON string         `gorm:"type:text;not null;default:''" json:"document"`
	DrawingJSON  string         `gorm:"type:text;not null;default:''" json:"drawing"`
	PlainText    string         `gorm:"type:text;not null;default:''" json:"plainText"`
	Color        string         `gorm:"size:32;not null;default:''" json:"color"`
	IsPinned     bool           `gorm:"not null;default:false" json:"isPinned"`
	WordCount    int            `gorm:"not null;default:0" json:"wordCount"`
	Revision     int            `gorm:"not null;default:1" json:"revision"`
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

// MediaAsset is an uploaded file plus its derived artefacts.
type MediaAsset struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	UserID       uint           `gorm:"not null;index:idx_media_user" json:"userId"`
	EntryID      *uint          `gorm:"index:idx_media_entry" json:"entryId,omitempty"`
	LivePhotoID  *uint          `gorm:"index:idx_media_live" json:"livePhotoId,omitempty"`
	LiveRole     string         `gorm:"size:16;not null;default:'standalone'" json:"liveRole"`
	Kind         string         `gorm:"size:24;not null;index" json:"kind"`
	OriginalName string         `gorm:"size:512;not null;default:''" json:"originalName"`
	StorageKey   string         `gorm:"size:128;not null;uniqueIndex" json:"-"`
	StoredPath   string         `gorm:"size:512;not null" json:"-"`
	DerivedPath  string         `gorm:"size:512;not null;default:''" json:"-"`
	PreviewPath  string         `gorm:"size:512;not null;default:''" json:"-"`
	MimeType     string         `gorm:"size:160;not null;default:'application/octet-stream'" json:"mimeType"`
	Size         int64          `gorm:"not null;default:0" json:"size"`
	Hash         string         `gorm:"size:64;not null;default:'';index" json:"-"`
	Width        int            `gorm:"not null;default:0" json:"width"`
	Height       int            `gorm:"not null;default:0" json:"height"`
	DurationMs   int            `gorm:"not null;default:0" json:"durationMs"`
	ExifJSON     string         `gorm:"type:text;not null;default:''" json:"-"`
	GPSLat       *float64       `gorm:"index:idx_media_gps" json:"latitude,omitempty"`
	GPSLon       *float64       `gorm:"index:idx_media_gps" json:"longitude,omitempty"`
	LocationName string         `gorm:"size:255;not null;default:''" json:"locationName,omitempty"`
	LocationSrc  string         `gorm:"size:32;not null;default:''" json:"locationSource,omitempty"`
	Attached     bool           `gorm:"not null;default:false" json:"attached"`
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

// Location is a geographic point attached to an entry and/or a media asset.
type Location struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"not null;index:idx_loc_user" json:"userId"`
	EntryID   *uint          `gorm:"index:idx_loc_entry" json:"entryId,omitempty"`
	MediaID   *uint          `gorm:"index:idx_loc_media" json:"mediaId,omitempty"`
	Name      string         `gorm:"size:255;not null;default:''" json:"name"`
	Address   string         `gorm:"size:255;not null;default:''" json:"address"`
	Latitude  float64        `gorm:"index:idx_loc_gps" json:"latitude"`
	Longitude float64        `gorm:"index:idx_loc_gps" json:"longitude"`
	Source    string         `gorm:"size:32;not null;default:'manual'" json:"source"`
	Status    string         `gorm:"size:32;not null;default:'confirmed'" json:"status"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// Session is a server side authentication session backed by an opaque cookie.
type Session struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	UserID     uint       `gorm:"not null;index:idx_session_user" json:"userId"`
	SecretHash string     `gorm:"size:64;not null;index" json:"-"`
	CSRFToken  string     `gorm:"size:64;not null" json:"csrfToken"`
	ExpiresAt  time.Time  `gorm:"not null;index" json:"expiresAt"`
	LastSeenAt time.Time  `json:"lastSeenAt"`
	RevokedAt  *time.Time `json:"revokedAt,omitempty"`
	UserAgent  string     `gorm:"size:512;not null;default:''" json:"-"`
	IP         string     `gorm:"size:64;not null;default:''" json:"-"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

// Job is a durable background task.
type Job struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	UserID      uint       `gorm:"not null;index:idx_job_user" json:"userId"`
	Type        string     `gorm:"size:64;not null;index:idx_job_type" json:"type"`
	TargetID    uint       `gorm:"not null;default:0" json:"targetId"`
	Status      string     `gorm:"size:16;not null;default:'pending';index:idx_job_status" json:"status"`
	Attempts    int        `gorm:"not null;default:0" json:"attempts"`
	MaxAttempts int        `gorm:"not null;default:3" json:"maxAttempts"`
	RunAfter    time.Time  `gorm:"not null;index:idx_job_status" json:"runAfter"`
	LockedAt    *time.Time `json:"lockedAt,omitempty"`
	LockedBy    string     `gorm:"size:64;not null;default:''" json:"-"`
	PayloadJSON string     `gorm:"type:text;not null;default:''" json:"-"`
	LastError   string     `gorm:"type:text;not null;default:''" json:"lastError,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

// Job statuses.
const (
	JobPending    = "pending"
	JobProcessing = "processing"
	JobCompleted  = "completed"
	JobFailed     = "failed"
)

// AIMetadata is derived, AI generated information. It is always kept apart
// from the user's own writing.
type AIMetadata struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	UserID        uint           `gorm:"not null;index:idx_ai_user" json:"userId"`
	EntryID       *uint          `gorm:"index:idx_ai_entry" json:"entryId,omitempty"`
	MediaID       *uint          `gorm:"index:idx_ai_media" json:"mediaId,omitempty"`
	Kind          string         `gorm:"size:16;not null;index:idx_ai_kind" json:"kind"`
	Status        string         `gorm:"size:16;not null;default:'pending'" json:"status"`
	Description   string         `gorm:"type:text;not null;default:''" json:"description"`
	Summary       string         `gorm:"type:text;not null;default:''" json:"summary"`
	Keywords      string         `gorm:"type:text;not null;default:'[]'" json:"keywords"`
	SuggestedTags string         `gorm:"type:text;not null;default:'[]'" json:"suggestedTags"`
	Model         string         `gorm:"size:128;not null;default:''" json:"model"`
	Error         string         `gorm:"type:text;not null;default:''" json:"error,omitempty"`
	SourceHash    string         `gorm:"size:64;not null;default:''" json:"-"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`
}

// AI metadata statuses.
const (
	AIPending     = "pending"
	AIProcessing  = "processing"
	AICompleted   = "completed"
	AIFailed      = "failed"
	AIUnavailable = "unavailable"
)

// AllModels is the full set of tables managed by the ORM.
func AllModels() []any {
	return []any{
		&User{}, &UserSettings{}, &Folder{}, &Tag{}, &EntryTag{},
		&Entry{}, &MediaAsset{}, &Location{}, &Session{}, &Job{}, &AIMetadata{},
	}
}
