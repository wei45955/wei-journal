// Package auth implements password hashing, server side sessions and the
// request middleware that enforces authentication, ownership and CSRF.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/httpx"
	"github.com/wei/journal/backend/internal/models"
)

// Cookie names used by the application.
const (
	SessionCookie = "wj_session"
	CSRFCookie    = "wj_csrf"
	CSRFHeader    = "X-CSRF-Token"
)

// Context keys.
const (
	ctxUser    = "auth.user"
	ctxSession = "auth.session"
)

var (
	// ErrInvalidCredentials is returned for both unknown users and bad passwords
	// so the API never reveals which accounts exist.
	ErrInvalidCredentials = errors.New("invalid credentials")
	// ErrSessionExpired is returned when the session is no longer usable.
	ErrSessionExpired = errors.New("session expired")
	// ErrCSRF is returned when the CSRF token does not match.
	ErrCSRF = errors.New("csrf token mismatch")
)

// HashPassword produces a bcrypt hash for storage.
func HashPassword(password string) (string, error) {
	if len(password) < 8 {
		return "", errors.New("password must be at least 8 characters")
	}
	if len(password) > 72 {
		return "", errors.New("password must be at most 72 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// VerifyPassword compares a plaintext password against a stored hash.
func VerifyPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// Service owns session lifecycle concerns.
type Service struct {
	db           *gorm.DB
	sessionTTL   time.Duration
	refreshTTL   time.Duration
	cookieSecure bool
	cookieDomain string
	limiter      *Limiter
}

// NewService builds the auth service.
func NewService(db *gorm.DB, sessionTTL, refreshTTL time.Duration, cookieSecure bool, cookieDomain string) *Service {
	return &Service{
		db:           db,
		sessionTTL:   sessionTTL,
		refreshTTL:   refreshTTL,
		cookieSecure: cookieSecure,
		cookieDomain: cookieDomain,
		limiter:      NewLimiter(10, 15*time.Minute),
	}
}

// SessionInfo is returned to the client after a successful login.
type SessionInfo struct {
	CSRFToken string    `json:"csrfToken"`
	ExpiresAt time.Time `json:"expiresAt"`
}

// CreateSession opens a new session for the user and writes the cookies.
func (s *Service) CreateSession(c *gin.Context, user *models.User) (*SessionInfo, error) {
	secret, err := randomToken(32)
	if err != nil {
		return nil, err
	}
	csrf, err := randomToken(32)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	expires := now.Add(s.refreshTTL)

	session := models.Session{
		UserID:     user.ID,
		SecretHash: hashSecret(secret),
		CSRFToken:  csrf,
		ExpiresAt:  expires,
		LastSeenAt: now,
		UserAgent:  truncate(c.Request.UserAgent(), 500),
		IP:         c.ClientIP(),
	}
	if err := s.db.Create(&session).Error; err != nil {
		return nil, err
	}
	s.setCookies(c, fmt.Sprintf("%d.%s", session.ID, secret), csrf, expires)
	return &SessionInfo{CSRFToken: csrf, ExpiresAt: expires}, nil
}

// RotateSession exchanges the session secret for a fresh one and slides the
// expiry forward. A session that is still within its current deadline can
// always be renewed, including by someone who has kept using the journal,
// so the deadline is measured from the renewal and not from the original
// sign-in.
func (s *Service) RotateSession(c *gin.Context) (*SessionInfo, error) {
	session, secret, ok := s.readSession(c)
	if !ok {
		return nil, ErrSessionExpired
	}
	newSecret, err := randomToken(32)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	expires := now.Add(s.refreshTTL)
	err = s.db.Model(&models.Session{}).
		Where("id = ? AND secret_hash = ?", session.ID, hashSecret(secret)).
		Updates(map[string]any{
			"secret_hash":  hashSecret(newSecret),
			"expires_at":   expires,
			"last_seen_at": now,
			"updated_at":   now,
		}).Error
	if err != nil {
		return nil, err
	}
	s.setCookies(c, fmt.Sprintf("%d.%s", session.ID, newSecret), session.CSRFToken, expires)
	return &SessionInfo{CSRFToken: session.CSRFToken, ExpiresAt: expires}, nil
}

// RevokeSession invalidates the current session server side.
func (s *Service) RevokeSession(c *gin.Context) error {
	session, _, ok := s.readSession(c)
	if ok {
		now := time.Now().UTC()
		s.db.Model(&models.Session{}).Where("id = ?", session.ID).Update("revoked_at", now)
	}
	s.clearCookies(c)
	return nil
}

// RevokeAllSessions invalidates every session for a user, used on password
// change and on account level security events.
func (s *Service) RevokeAllSessions(userID uint) error {
	now := time.Now().UTC()
	return s.db.Model(&models.Session{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", now).Error
}

// readSession loads the session referenced by the request cookie.
func (s *Service) readSession(c *gin.Context) (*models.Session, string, bool) {
	raw, err := c.Cookie(SessionCookie)
	if err != nil {
		return nil, "", false
	}
	idPart, secret, found := strings.Cut(raw, ".")
	if !found {
		return nil, "", false
	}
	id, err := strconv.ParseUint(idPart, 10, 64)
	if err != nil {
		return nil, "", false
	}
	var session models.Session
	err = s.db.Where("id = ?", id).First(&session).Error
	if err != nil {
		return nil, "", false
	}
	if session.RevokedAt != nil {
		return nil, "", false
	}
	if subtle.ConstantTimeCompare([]byte(session.SecretHash), []byte(hashSecret(secret))) != 1 {
		return nil, "", false
	}
	if time.Now().UTC().After(session.ExpiresAt) {
		return nil, "", false
	}
	return &session, secret, true
}

func (s *Service) setCookies(c *gin.Context, value, csrf string, expires time.Time) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     SessionCookie,
		Value:    value,
		Path:     "/",
		Domain:   s.cookieDomain,
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
		HttpOnly: true,
		Secure:   s.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
	// The CSRF cookie is intentionally readable by the frontend: it is a
	// double submit token that the client echoes back in a header.
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     CSRFCookie,
		Value:    csrf,
		Path:     "/",
		Domain:   s.cookieDomain,
		Expires:  expires,
		MaxAge:   int(time.Until(expires).Seconds()),
		HttpOnly: false,
		Secure:   s.cookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (s *Service) clearCookies(c *gin.Context) {
	for _, name := range []string{SessionCookie, CSRFCookie} {
		http.SetCookie(c.Writer, &http.Cookie{
			Name:     name,
			Value:    "",
			Path:     "/",
			Domain:   s.cookieDomain,
			Expires:  time.Unix(0, 0),
			MaxAge:   -1,
			HttpOnly: name == SessionCookie,
			Secure:   s.cookieSecure,
			SameSite: http.SameSiteLaxMode,
		})
	}
}

// Authenticate resolves the session for the request and attaches the user.
// It does not write a response; use it as a route group middleware.
func (s *Service) Authenticate() gin.HandlerFunc {
	return func(c *gin.Context) {
		session, _, ok := s.readSession(c)
		if !ok {
			httpx.Unauthorized(c, "authentication required")
			return
		}
		// A session that has not been used for longer than the session
		// lifetime has to be renewed. The renewal endpoint is not behind
		// this middleware, so the client can still renew it.
		if s.sessionTTL > 0 && time.Since(session.LastSeenAt) > s.sessionTTL {
			httpx.Fail(c, http.StatusUnauthorized, &httpx.Error{
				Code:    httpx.CodeSessionExpired,
				Message: "the session has to be renewed",
			})
			return
		}
		var user models.User
		if err := s.db.First(&user, session.UserID).Error; err != nil {
			httpx.Unauthorized(c, "authentication required")
			return
		}
		if user.Disabled {
			httpx.Forbidden(c, "account disabled")
			return
		}
		// Touch the session at most once a minute. The expiry slides forward
		// with that touch, and the cookies are rewritten to match, so a
		// journal that is in use does not sign the reader out.
		if time.Since(session.LastSeenAt) > time.Minute {
			now := time.Now().UTC()
			expires := now.Add(s.refreshTTL)
			s.db.Model(&models.Session{}).Where("id = ?", session.ID).
				Updates(map[string]any{
					"last_seen_at": now,
					"expires_at":   expires,
				})
			if raw, err := c.Cookie(SessionCookie); err == nil {
				s.setCookies(c, raw, session.CSRFToken, expires)
			}
		}
		c.Set(ctxUser, &user)
		c.Set(ctxSession, session)
		c.Next()
	}
}

// RequireCSRF rejects state changing requests without a matching token.
func (s *Service) RequireCSRF() gin.HandlerFunc {
	return func(c *gin.Context) {
		if isSafeMethod(c.Request.Method) {
			c.Next()
			return
		}
		session, _, ok := s.readSession(c)
		if !ok {
			httpx.Unauthorized(c, "authentication required")
			return
		}
		header := c.GetHeader(CSRFHeader)
		if header == "" {
			header = c.PostForm("csrfToken")
		}
		if subtle.ConstantTimeCompare([]byte(session.CSRFToken), []byte(header)) != 1 {
			httpx.Fail(c, http.StatusForbidden, &httpx.Error{
				Code:    httpx.CodeForbidden,
				Message: "invalid csrf token",
			})
			return
		}
		c.Next()
	}
}

// CurrentUser returns the authenticated user for the request.
func CurrentUser(c *gin.Context) *models.User {
	v, ok := c.Get(ctxUser)
	if !ok {
		return nil
	}
	user, _ := v.(*models.User)
	return user
}

// CurrentSession returns the authenticated session for the request.
func CurrentSession(c *gin.Context) *models.Session {
	v, ok := c.Get(ctxSession)
	if !ok {
		return nil
	}
	session, _ := v.(*models.Session)
	return session
}

// Limiter is a small in-memory fixed window limiter used to slow down
// brute force login attempts.
type Limiter struct {
	mu       sync.Mutex
	limit    int
	window   time.Duration
	attempts map[string]*window
}

type window struct {
	count int
	reset time.Time
}

// NewLimiter creates a limiter allowing `limit` events per `period`.
func NewLimiter(limit int, period time.Duration) *Limiter {
	return &Limiter{limit: limit, window: period, attempts: map[string]*window{}}
}

// Allow reports whether an event for key is permitted and records it.
func (l *Limiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	w, ok := l.attempts[key]
	if !ok || now.After(w.reset) {
		l.attempts[key] = &window{count: 1, reset: now.Add(l.window)}
		if len(l.attempts) > 10000 {
			l.prune(now)
		}
		return true
	}
	if w.count >= l.limit {
		return false
	}
	w.count++
	return true
}

// Reset clears the counter for key, used after a successful login.
func (l *Limiter) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.attempts, key)
}

func (l *Limiter) prune(now time.Time) {
	for k, w := range l.attempts {
		if now.After(w.reset) {
			delete(l.attempts, k)
		}
	}
}

// AllowLogin consults the login rate limiter.
func (s *Service) AllowLogin(key string) bool { return s.limiter.Allow(key) }

// ResetLogin clears the login limiter for a key.
func (s *Service) ResetLogin(key string) { s.limiter.Reset(key) }

func isSafeMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace:
		return true
	}
	return false
}

func randomToken(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func hashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
