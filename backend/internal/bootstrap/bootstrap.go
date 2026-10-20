// Package bootstrap prepares the first administrator account and the default
// settings of new users.
package bootstrap

import (
	"fmt"
	"log/slog"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/models"
)

// Admin describes the administrator seeded from the environment.
type Admin struct {
	Username string
	Password string
	Email    string
}

// EnsureAdmin creates the administrator account when the installation has no
// user yet. It is a no-op once any account exists, so it can run on every
// start without ever changing an existing installation.
func EnsureAdmin(db *gorm.DB, log *slog.Logger, admin Admin) error {
	if admin.Username == "" || admin.Password == "" {
		return nil
	}
	var count int64
	if err := db.Model(&models.User{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	hash, err := auth.HashPassword(admin.Password)
	if err != nil {
		return fmt.Errorf("hash admin password: %w", err)
	}
	user := models.User{
		Username:     admin.Username,
		Email:        admin.Email,
		PasswordHash: hash,
		Role:         models.RoleAdmin,
	}
	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return tx.Create(&models.UserSettings{
			UserID:   user.ID,
			Language: "en",
			Timezone: "UTC",
			Theme:    "system",
		}).Error
	})
	if err != nil {
		if isUniqueViolation(err) {
			// Another instance created the account first.
			return nil
		}
		return err
	}
	log.Info("administrator account created", "username", user.Username)
	return nil
}

// EnsureSettings creates the default settings of a user that has none, which
// happens when an account was created before the settings table existed.
func EnsureSettings(db *gorm.DB, userID uint) error {
	var count int64
	if err := db.Model(&models.UserSettings{}).Where("user_id = ?", userID).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	return db.Create(&models.UserSettings{
		UserID:   userID,
		Language: "en",
		Timezone: "UTC",
		Theme:    "system",
	}).Error
}

// PurgeExpiredSessions removes sessions that can no longer be used.
func PurgeExpiredSessions(db *gorm.DB, log *slog.Logger) error {
	cutoff := time.Now().UTC().Add(-30 * 24 * time.Hour)
	result := db.Where("expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)", cutoff, cutoff).
		Delete(&models.Session{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 {
		log.Info("removed expired sessions", "count", result.RowsAffected)
	}
	return nil
}

func isUniqueViolation(err error) bool {
	msg := err.Error()
	return strings.Contains(msg, "UNIQUE constraint failed") ||
		strings.Contains(msg, "duplicate key value violates unique constraint") ||
		strings.Contains(msg, "Duplicate entry")
}
