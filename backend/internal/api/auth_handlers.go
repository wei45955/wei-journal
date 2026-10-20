package api

import (
	"errors"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/httpx"
	"github.com/wei/journal/backend/internal/models"
)

var usernamePattern = regexp.MustCompile(`^[A-Za-z0-9._-]{3,64}$`)
var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s.]+\.[^@\s]+$`)

type registerRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

func (s *Server) handleRegister(c *gin.Context) {
	if !s.cfg.AllowRegister {
		httpx.Forbidden(c, "registration is disabled on this server")
		return
	}
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	details := map[string]string{}
	if !usernamePattern.MatchString(req.Username) {
		details["username"] = "3-64 characters, letters, digits, dot, dash or underscore"
	}
	if req.Email != "" && !emailPattern.MatchString(req.Email) {
		details["email"] = "invalid email address"
	}
	if len(req.Password) < 8 {
		details["password"] = "at least 8 characters"
	}
	if len(req.Password) > 72 {
		details["password"] = "at most 72 characters"
	}
	if len(details) > 0 {
		httpx.ValidationError(c, "please check the highlighted fields", details)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		httpx.ValidationError(c, err.Error(), map[string]string{"password": err.Error()})
		return
	}

	var user models.User
	err = s.handle.DB().Transaction(func(tx *gorm.DB) error {
		var count int64
		if err := tx.Model(&models.User{}).Count(&count).Error; err != nil {
			return err
		}
		role := models.RoleUser
		if count == 0 {
			// The very first account bootstraps the installation as admin.
			role = models.RoleAdmin
		}
		user = models.User{
			Username:     req.Username,
			Email:        req.Email,
			PasswordHash: hash,
			Role:         role,
		}
		if err := tx.Create(&user).Error; err != nil {
			return err
		}
		return tx.Create(&models.UserSettings{
			UserID:   user.ID,
			Language: "en",
			Timezone: "auto",
			Theme:    "system",
		}).Error
	})
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Conflict(c, "that username is already taken")
			return
		}
		httpx.Internal(c, s.log, err, "register")
		return
	}

	settings, _ := s.loadSettings(user.ID)
	s.log.Info("account created", "username", user.Username, "role", user.Role)
	info, err := s.auth.CreateSession(c, &user)
	if err != nil {
		httpx.Internal(c, s.log, err, "create session")
		return
	}
	httpx.Created(c, gin.H{
		"user":      toUserDTO(&user, settings),
		"csrfToken": info.CSRFToken,
	})
}

func (s *Server) handleLogin(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	req.Username = strings.TrimSpace(req.Username)

	limiterKey := "login:" + c.ClientIP() + ":" + strings.ToLower(req.Username)
	if !s.auth.AllowLogin(limiterKey) {
		httpx.Fail(c, http.StatusTooManyRequests, &httpx.Error{
			Code:    httpx.CodeRateLimit,
			Message: "too many sign-in attempts, please wait a few minutes",
		})
		return
	}

	var user models.User
	err := s.handle.DB().Where("username = ?", req.Username).First(&user).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			httpx.Internal(c, s.log, err, "login lookup")
			return
		}
		// Spend a comparable amount of time so the response time does not
		// reveal whether the account exists.
		auth.VerifyPassword("$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv", req.Password)
		httpx.Unauthorized(c, "incorrect username or password")
		return
	}
	if !auth.VerifyPassword(user.PasswordHash, req.Password) {
		httpx.Unauthorized(c, "incorrect username or password")
		return
	}
	if user.Disabled {
		httpx.Forbidden(c, "this account is disabled")
		return
	}

	s.auth.ResetLogin(limiterKey)
	now := time.Now().UTC()
	s.handle.DB().Model(&models.User{}).Where("id = ?", user.ID).Update("last_login_at", now)

	settings, _ := s.loadSettings(user.ID)
	info, err := s.auth.CreateSession(c, &user)
	if err != nil {
		httpx.Internal(c, s.log, err, "create session")
		return
	}
	httpx.OK(c, gin.H{
		"user":      toUserDTO(&user, settings),
		"csrfToken": info.CSRFToken,
	})
}

func (s *Server) handleRefresh(c *gin.Context) {
	info, err := s.auth.RotateSession(c)
	if err != nil {
		httpx.Unauthorized(c, "session expired")
		return
	}
	httpx.OK(c, gin.H{"csrfToken": info.CSRFToken, "expiresAt": info.ExpiresAt})
}

func (s *Server) handleLogout(c *gin.Context) {
	if err := s.auth.RevokeSession(c); err != nil {
		httpx.Internal(c, s.log, err, "logout")
		return
	}
	httpx.NoContent(c)
}

func (s *Server) handleMe(c *gin.Context) {
	user := auth.CurrentUser(c)
	settings, _ := s.loadSettings(user.ID)
	session := auth.CurrentSession(c)
	httpx.OK(c, gin.H{
		"user":      toUserDTO(user, settings),
		"csrfToken": session.CSRFToken,
	})
}

func (s *Server) handleChangePassword(c *gin.Context) {
	user := auth.CurrentUser(c)
	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.ValidationError(c, "invalid request body", nil)
		return
	}
	if !auth.VerifyPassword(user.PasswordHash, req.CurrentPassword) {
		httpx.Unauthorized(c, "current password is incorrect")
		return
	}
	if len(req.NewPassword) < 8 {
		httpx.ValidationError(c, "please check the highlighted fields", map[string]string{
			"newPassword": "at least 8 characters",
		})
		return
	}
	if len(req.NewPassword) > 72 {
		httpx.ValidationError(c, "please check the highlighted fields", map[string]string{
			"newPassword": "at most 72 characters",
		})
		return
	}
	hash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		httpx.ValidationError(c, err.Error(), map[string]string{"newPassword": err.Error()})
		return
	}
	if err := s.handle.DB().Model(&models.User{}).Where("id = ?", user.ID).
		Update("password_hash", hash).Error; err != nil {
		httpx.Internal(c, s.log, err, "change password")
		return
	}
	// Changing a password invalidates every other session.
	if err := s.auth.RevokeAllSessions(user.ID); err != nil {
		httpx.Internal(c, s.log, err, "revoke sessions")
		return
	}
	info, err := s.auth.CreateSession(c, user)
	if err != nil {
		httpx.Internal(c, s.log, err, "create session")
		return
	}
	httpx.OK(c, gin.H{"csrfToken": info.CSRFToken, "expiresAt": info.ExpiresAt})
}

func (s *Server) handleListSessions(c *gin.Context) {
	user := auth.CurrentUser(c)
	current := auth.CurrentSession(c)
	var sessions []models.Session
	err := s.handle.DB().Where("user_id = ? AND revoked_at IS NULL AND expires_at > ?", user.ID, time.Now().UTC()).
		Order("last_seen_at DESC").Find(&sessions).Error
	if err != nil {
		httpx.Internal(c, s.log, err, "list sessions")
		return
	}
	out := make([]SessionDTO, 0, len(sessions))
	for i := range sessions {
		out = append(out, toSessionDTO(&sessions[i], current.ID))
	}
	httpx.OK(c, out)
}

func (s *Server) handleRevokeSession(c *gin.Context) {
	user := auth.CurrentUser(c)
	id, ok := httpx.PathUint(c, "id")
	if !ok {
		httpx.NotFound(c, "session not found")
		return
	}
	result := s.handle.DB().Model(&models.Session{}).
		Where("id = ? AND user_id = ?", id, user.ID).
		Update("revoked_at", time.Now().UTC())
	if result.Error != nil {
		httpx.Internal(c, s.log, result.Error, "revoke session")
		return
	}
	if result.RowsAffected == 0 {
		httpx.NotFound(c, "session not found")
		return
	}
	httpx.NoContent(c)
}

func (s *Server) loadSettings(userID uint) (*models.UserSettings, error) {
	var settings models.UserSettings
	err := s.handle.DB().Where("user_id = ?", userID).First(&settings).Error
	if err != nil {
		return nil, err
	}
	return &settings, nil
}

// isUniqueViolation detects a duplicate key error across SQLite and Postgres.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "unique violation")
}
