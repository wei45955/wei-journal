// Tests for the auth package. The suite focuses on the security boundaries
// of the package: password hashing, the "<sessionID>.<secret>" session cookie
// whose secret is only ever stored as a SHA-256 hash, the double submit CSRF
// token and the login rate limiter.
package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/wei/journal/backend/internal/db"
	"github.com/wei/journal/backend/internal/models"
)

// testPassword is the password used by the fixture users.
const testPassword = "correct horse battery staple"

// TestMain switches gin into test mode for the whole package.
func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	os.Exit(m.Run())
}

// rig is an isolated auth service backed by a temporary SQLite database.
type rig struct {
	t      *testing.T
	svc    *Service
	db     *gorm.DB
	router *gin.Engine
}

// newRig boots an auth service with its own database and router.
func newRig(t *testing.T) *rig {
	t.Helper()

	dir := t.TempDir()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	handle, err := db.Open("sqlite://"+filepath.Join(dir, "test.db"), log)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })

	svc := NewService(handle.DB(), time.Hour, 24*time.Hour, false, "")

	router := gin.New()
	probe := func(c *gin.Context) {
		c.Header("X-Probe", "ok")
		c.Status(http.StatusOK)
	}
	// /auth/probe requires a valid session and, for unsafe methods, a valid
	// CSRF token. /csrf/probe only applies the CSRF check, which makes the
	// difference between the two checks observable.
	router.Group("/auth", svc.Authenticate(), svc.RequireCSRF()).Any("/probe", probe)
	router.Group("/csrf", svc.RequireCSRF()).Any("/probe", probe)

	return &rig{t: t, svc: svc, db: handle.DB(), router: router}
}

// createUser inserts a user into the rig database.
func (rig *rig) createUser(username string) *models.User {
	rig.t.Helper()
	hash, err := HashPassword(testPassword)
	if err != nil {
		rig.t.Fatalf("hash password: %v", err)
	}
	user := models.User{Username: username, PasswordHash: hash, Role: models.RoleUser}
	if err := rig.db.Create(&user).Error; err != nil {
		rig.t.Fatalf("create user %q: %v", username, err)
	}
	return &user
}

// createSession opens a session for the user and returns the session cookie
// value, the CSRF token and the stored session row.
func (rig *rig) createSession(user *models.User) (string, string, models.Session) {
	rig.t.Helper()

	rec, info := rig.callSession(user)
	cookies := cookiesByName(rec, SessionCookie, CSRFCookie)
	sessionCookie := cookies[SessionCookie]
	csrfCookie := cookies[CSRFCookie]
	if sessionCookie == nil {
		rig.t.Fatal("CreateSession did not set a session cookie")
	}
	if csrfCookie == nil {
		rig.t.Fatal("CreateSession did not set a CSRF cookie")
	}
	if csrfCookie.Value != info.CSRFToken {
		rig.t.Fatalf("CSRF cookie %q does not match the returned token %q", csrfCookie.Value, info.CSRFToken)
	}

	var row models.Session
	if err := rig.db.Where("user_id = ?", user.ID).Order("id DESC").First(&row).Error; err != nil {
		rig.t.Fatalf("load created session: %v", err)
	}
	return sessionCookie.Value, csrfCookie.Value, row
}

// callSession invokes CreateSession on a synthetic gin context.
func (rig *rig) callSession(user *models.User) (*httptest.ResponseRecorder, *SessionInfo) {
	rig.t.Helper()
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	c.Request = httptest.NewRequest(http.MethodPost, "/session", nil)
	c.Request.Header.Set("User-Agent", "journal-test-agent")
	info, err := rig.svc.CreateSession(c, user)
	if err != nil {
		rig.t.Fatalf("CreateSession: %v", err)
	}
	return rec, info
}

// contextWithCookie builds a gin context carrying the given session cookie.
// An empty value means "no session cookie at all".
func (rig *rig) contextWithCookie(value string) (*gin.Context, *httptest.ResponseRecorder) {
	rig.t.Helper()
	rec := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(rec)
	req := httptest.NewRequest(http.MethodPost, "/session/rotate", nil)
	if value != "" {
		req.AddCookie(&http.Cookie{Name: SessionCookie, Value: value})
	}
	c.Request = req
	return c, rec
}

// do performs a request against the rig router.
func (rig *rig) do(method, path string, cookies, headers map[string]string) *httptest.ResponseRecorder {
	rig.t.Helper()
	req := httptest.NewRequest(method, path, nil)
	for name, value := range cookies {
		req.AddCookie(&http.Cookie{Name: name, Value: value})
	}
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	rec := httptest.NewRecorder()
	rig.router.ServeHTTP(rec, req)
	return rec
}

// doForm performs a form encoded request against the rig router.
func (rig *rig) doForm(method, path string, cookies map[string]string, form url.Values) *httptest.ResponseRecorder {
	rig.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	for name, value := range cookies {
		req.AddCookie(&http.Cookie{Name: name, Value: value})
	}
	rec := httptest.NewRecorder()
	rig.router.ServeHTTP(rec, req)
	return rec
}

// cookiesByName picks the named cookies out of a response.
func cookiesByName(rec *httptest.ResponseRecorder, names ...string) map[string]*http.Cookie {
	out := map[string]*http.Cookie{}
	for _, cookie := range rec.Result().Cookies() {
		for _, name := range names {
			if cookie.Name == name {
				out[name] = cookie
			}
		}
	}
	return out
}

// errorCode decodes the machine readable error code of a response.
func errorCode(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var envelope struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("decode error body %q: %v", rec.Body.String(), err)
	}
	return envelope.Error.Code
}

// sha256Hex hashes a value the same way the server is expected to.
func sha256Hex(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

// sessionCookieValue builds the "<id>.<secret>" cookie value for a session.
func sessionCookieValue(id uint, secret string) string {
	return strconv.FormatUint(uint64(id), 10) + "." + secret
}

// splitCookie splits a session cookie into its id and secret parts.
func splitCookie(t *testing.T, value string) (uint, string) {
	t.Helper()
	if strings.Count(value, ".") != 1 {
		t.Fatalf("session cookie %q does not have the <id>.<secret> shape", value)
	}
	idPart, secret, _ := strings.Cut(value, ".")
	id, err := strconv.ParseUint(idPart, 10, 64)
	if err != nil {
		t.Fatalf("session cookie %q has a non numeric id: %v", value, err)
	}
	if secret == "" {
		t.Fatalf("session cookie %q has an empty secret", value)
	}
	return uint(id), secret
}

// flipChar changes the last character of a string.
func flipChar(s string) string {
	if s == "" {
		return "x"
	}
	replacement := byte('A')
	if s[len(s)-1] == 'A' {
		replacement = 'B'
	}
	return s[:len(s)-1] + string(replacement)
}

// requireStatus fails the test when the status code is not the expected one.
func requireStatus(t *testing.T, rec *httptest.ResponseRecorder, want int, what string) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("%s: status = %d, want %d (body %s)", what, rec.Code, want, rec.Body.String())
	}
}

// requireNotReached fails the test when the protected handler was executed.
func requireNotReached(t *testing.T, rec *httptest.ResponseRecorder, what string) {
	t.Helper()
	if rec.Header().Get("X-Probe") != "" {
		t.Fatalf("%s: the protected handler ran", what)
	}
}

// TestHashPasswordDoesNotStoreThePlaintext checks that the stored credential
// is a salted bcrypt hash and never the password itself.
func TestHashPasswordDoesNotStoreThePlaintext(t *testing.T) {
	hash, err := HashPassword(testPassword)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if hash == "" {
		t.Fatal("HashPassword returned an empty hash")
	}
	if hash == testPassword {
		t.Fatal("HashPassword returned the plaintext password")
	}
	if strings.Contains(hash, testPassword) {
		t.Fatalf("hash %q contains the plaintext password", hash)
	}
	if !strings.HasPrefix(hash, "$2") {
		t.Fatalf("hash %q is not a bcrypt hash", hash)
	}
	if !VerifyPassword(hash, testPassword) {
		t.Fatal("VerifyPassword rejected the correct password")
	}
	if VerifyPassword(hash, testPassword+"!") {
		t.Fatal("VerifyPassword accepted a wrong password")
	}
	if VerifyPassword(hash, "") {
		t.Fatal("VerifyPassword accepted an empty password")
	}
	if VerifyPassword("not-a-bcrypt-hash", testPassword) {
		t.Fatal("VerifyPassword accepted a malformed hash")
	}

	// bcrypt salts every hash, so two hashes of the same password differ.
	other, err := HashPassword(testPassword)
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if other == hash {
		t.Fatal("two hashes of the same password are identical, the hash is not salted")
	}
	if !VerifyPassword(other, testPassword) {
		t.Fatal("VerifyPassword rejected the correct password for a second hash")
	}

	if _, err := HashPassword("short"); err == nil {
		t.Fatal("HashPassword accepted a password shorter than 8 characters")
	}
	if _, err := HashPassword(strings.Repeat("a", 73)); err == nil {
		t.Fatal("HashPassword accepted a password longer than 72 bytes")
	}
}

// TestCreateSessionSetsTheSessionAndCSRFCookies checks the cookies written by
// CreateSession and the shape of the stored session row.
func TestCreateSessionSetsTheSessionAndCSRFCookies(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")

	rec, info := rig.callSession(user)
	cookies := cookiesByName(rec, SessionCookie, CSRFCookie)
	sessionCookie := cookies[SessionCookie]
	csrfCookie := cookies[CSRFCookie]
	if sessionCookie == nil {
		t.Fatal("CreateSession did not set a session cookie")
	}
	if csrfCookie == nil {
		t.Fatal("CreateSession did not set a CSRF cookie")
	}

	// The session cookie carries the credential and must not be readable from
	// scripts; the CSRF cookie is a double submit token and must be.
	if !sessionCookie.HttpOnly {
		t.Error("the session cookie is not HttpOnly")
	}
	if sessionCookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("the session cookie SameSite = %v, want Lax", sessionCookie.SameSite)
	}
	if sessionCookie.Path != "/" {
		t.Errorf("the session cookie Path = %q, want /", sessionCookie.Path)
	}
	if sessionCookie.Secure {
		t.Error("the session cookie is marked Secure although the service was configured without it")
	}
	if csrfCookie.HttpOnly {
		t.Error("the CSRF cookie is HttpOnly, the client cannot read it back")
	}
	if csrfCookie.SameSite != http.SameSiteLaxMode {
		t.Errorf("the CSRF cookie SameSite = %v, want Lax", csrfCookie.SameSite)
	}

	// The stored row keeps the user id and only a hash of the secret.
	var row models.Session
	if err := rig.db.Where("user_id = ?", user.ID).Order("id DESC").First(&row).Error; err != nil {
		t.Fatalf("load session: %v", err)
	}
	if row.UserID != user.ID {
		t.Errorf("the session belongs to user %d, want %d", row.UserID, user.ID)
	}

	id, secret := splitCookie(t, sessionCookie.Value)
	if id != row.ID {
		t.Errorf("the cookie carries session id %d, the stored row is %d", id, row.ID)
	}
	if row.SecretHash == secret {
		t.Fatal("the raw secret is stored in the session row")
	}
	if strings.Contains(row.SecretHash, secret) {
		t.Fatalf("the stored secret hash %q contains the raw secret", row.SecretHash)
	}
	if row.SecretHash != sha256Hex(secret) {
		t.Errorf("the stored secret hash %q is not the sha256 of the cookie secret", row.SecretHash)
	}
	if row.CSRFToken != csrfCookie.Value {
		t.Errorf("the stored CSRF token %q does not match the cookie %q", row.CSRFToken, csrfCookie.Value)
	}
	if row.CSRFToken != info.CSRFToken {
		t.Errorf("the stored CSRF token %q does not match the returned token %q", row.CSRFToken, info.CSRFToken)
	}
	if !row.ExpiresAt.After(time.Now().UTC()) {
		t.Errorf("the session expires at %s, which is not in the future", row.ExpiresAt)
	}
	if info.CSRFToken == "" {
		t.Error("CreateSession returned an empty CSRF token")
	}
	if !info.ExpiresAt.Equal(row.ExpiresAt) {
		t.Errorf("the returned expiry %s does not match the stored expiry %s", info.ExpiresAt, row.ExpiresAt)
	}
}

// TestAuthenticateRejectsAMissingSessionCookie checks that a request without
// a session cookie never reaches the protected handler.
func TestAuthenticateRejectsAMissingSessionCookie(t *testing.T) {
	rig := newRig(t)

	rec := rig.do(http.MethodGet, "/auth/probe", nil, nil)
	requireStatus(t, rec, http.StatusUnauthorized, "request without a session cookie")
	requireNotReached(t, rec, "request without a session cookie")
	if code := errorCode(t, rec); code != "unauthorized" {
		t.Errorf("error code = %q, want unauthorized", code)
	}
}

// TestAuthenticateRejectsATamperedSessionSecret checks that a modified secret
// in the cookie is refused.
func TestAuthenticateRejectsATamperedSessionSecret(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	cookie, _, _ := rig.createSession(user)
	id, secret := splitCookie(t, cookie)

	cases := []struct {
		name  string
		value string
	}{
		{"flipped last character", sessionCookieValue(id, flipChar(secret))},
		{"flipped first character", sessionCookieValue(id, "Z"+secret[1:])},
		{"truncated secret", sessionCookieValue(id, secret[:len(secret)-1])},
		{"empty secret", sessionCookieValue(id, "")},
		{"completely different secret", sessionCookieValue(id, strings.Repeat("z", len(secret)))},
		{"secret with an extra segment", sessionCookieValue(id, secret+".extra")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: tc.value}, nil)
			requireStatus(t, rec, http.StatusUnauthorized, "tampered session cookie")
			requireNotReached(t, rec, "tampered session cookie")
		})
	}
}

// TestAuthenticateRejectsAnUnknownSessionID checks that a cookie pointing at
// a session that does not exist is refused.
func TestAuthenticateRejectsAnUnknownSessionID(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	cookie, _, row := rig.createSession(user)
	_, secret := splitCookie(t, cookie)

	cases := []struct {
		name  string
		value string
	}{
		{"unknown id", sessionCookieValue(row.ID+9999, secret)},
		{"non numeric id", "not-a-number." + secret},
		{"negative id", "-1." + secret},
		{"empty id", "." + secret},
		{"no separator", strconv.FormatUint(uint64(row.ID), 10)},
		{"empty cookie", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: tc.value}, nil)
			requireStatus(t, rec, http.StatusUnauthorized, "unknown session id")
			requireNotReached(t, rec, "unknown session id")
		})
	}
}

// TestAuthenticateRejectsAnExpiredSession checks that a session whose expiry
// lies in the past is refused.
func TestAuthenticateRejectsAnExpiredSession(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")

	secret := strings.Repeat("s", 43)
	row := models.Session{
		UserID:     user.ID,
		SecretHash: sha256Hex(secret),
		CSRFToken:  "csrf-token",
		ExpiresAt:  time.Now().UTC().Add(-time.Hour),
		LastSeenAt: time.Now().UTC().Add(-time.Hour),
	}
	if err := rig.db.Create(&row).Error; err != nil {
		t.Fatalf("create expired session: %v", err)
	}

	rec := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: sessionCookieValue(row.ID, secret)}, nil)
	requireStatus(t, rec, http.StatusUnauthorized, "expired session")
	requireNotReached(t, rec, "expired session")

	// The row itself is untouched, only the expiry makes it unusable.
	var stored models.Session
	if err := rig.db.First(&stored, row.ID).Error; err != nil {
		t.Fatalf("reload session: %v", err)
	}
	if !stored.ExpiresAt.Before(time.Now().UTC()) {
		t.Errorf("the stored expiry %s is not in the past", stored.ExpiresAt)
	}
}

// TestRotateSessionIssuesANewSecretAndInvalidatesTheOldOne checks that a
// rotation keeps the session id but replaces the secret.
func TestRotateSessionIssuesANewSecretAndInvalidatesTheOldOne(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	cookie, csrf, row := rig.createSession(user)
	oldID, oldSecret := splitCookie(t, cookie)

	c, rec := rig.contextWithCookie(cookie)
	info, err := rig.svc.RotateSession(c)
	if err != nil {
		t.Fatalf("RotateSession: %v", err)
	}
	cookies := cookiesByName(rec, SessionCookie)
	if cookies[SessionCookie] == nil {
		t.Fatal("RotateSession did not set a session cookie")
	}
	newCookie := cookies[SessionCookie].Value
	newID, newSecret := splitCookie(t, newCookie)

	if newID != oldID {
		t.Errorf("the session id changed from %d to %d, a rotation must keep it", oldID, newID)
	}
	if newSecret == oldSecret {
		t.Fatal("the secret was not rotated")
	}

	// The old cookie no longer authenticates, the new one does.
	old := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: cookie}, nil)
	requireStatus(t, old, http.StatusUnauthorized, "the old session cookie")
	requireNotReached(t, old, "the old session cookie")

	fresh := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: newCookie}, nil)
	requireStatus(t, fresh, http.StatusOK, "the rotated session cookie")
	if fresh.Header().Get("X-Probe") != "ok" {
		t.Error("the protected handler did not run for the rotated cookie")
	}

	// A rotation must not create a second session.
	var count int64
	if err := rig.db.Model(&models.Session{}).Where("user_id = ?", user.ID).Count(&count).Error; err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	if count != 1 {
		t.Errorf("the user owns %d session rows after a rotation, want 1", count)
	}

	var stored models.Session
	if err := rig.db.First(&stored, row.ID).Error; err != nil {
		t.Fatalf("reload session: %v", err)
	}
	if stored.SecretHash != sha256Hex(newSecret) {
		t.Errorf("the stored secret hash %q does not match the new secret", stored.SecretHash)
	}
	if stored.SecretHash == sha256Hex(oldSecret) {
		t.Error("the stored secret hash still matches the old secret")
	}
	if stored.CSRFToken != csrf {
		t.Errorf("the CSRF token changed during the rotation: %q, want %q", stored.CSRFToken, csrf)
	}
	if info.CSRFToken != csrf {
		t.Errorf("the returned CSRF token %q, want %q", info.CSRFToken, csrf)
	}
	if !stored.ExpiresAt.After(time.Now().UTC()) {
		t.Errorf("the rotated session expires at %s, which is not in the future", stored.ExpiresAt)
	}
}

// TestRotateSessionRejectsARequestWithNoSession checks that a rotation without
// a session fails and does not create anything.
func TestRotateSessionRejectsARequestWithNoSession(t *testing.T) {
	rig := newRig(t)

	c, rec := rig.contextWithCookie("")
	info, err := rig.svc.RotateSession(c)
	if !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("RotateSession error = %v, want %v", err, ErrSessionExpired)
	}
	if info != nil {
		t.Errorf("RotateSession returned %+v, want nil", info)
	}
	if cookies := rec.Result().Cookies(); len(cookies) != 0 {
		t.Errorf("RotateSession wrote %d cookies, want none", len(cookies))
	}
	var count int64
	if err := rig.db.Model(&models.Session{}).Count(&count).Error; err != nil {
		t.Fatalf("count sessions: %v", err)
	}
	if count != 0 {
		t.Errorf("a rejected rotation created %d session rows, want 0", count)
	}
}

// TestRevokeSessionInvalidatesIt checks that revoking a session kills it
// server side and clears the client cookies.
func TestRevokeSessionInvalidatesIt(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	cookie, _, row := rig.createSession(user)

	c, rec := rig.contextWithCookie(cookie)
	if err := rig.svc.RevokeSession(c); err != nil {
		t.Fatalf("RevokeSession: %v", err)
	}

	var stored models.Session
	if err := rig.db.First(&stored, row.ID).Error; err != nil {
		t.Fatalf("reload session: %v", err)
	}
	if stored.RevokedAt == nil {
		t.Fatal("the session was not marked as revoked")
	}

	revoked := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: cookie}, nil)
	requireStatus(t, revoked, http.StatusUnauthorized, "the revoked session cookie")
	requireNotReached(t, revoked, "the revoked session cookie")

	cookies := cookiesByName(rec, SessionCookie, CSRFCookie)
	if cookies[SessionCookie] == nil {
		t.Fatal("the session cookie was not cleared")
	}
	if cookies[CSRFCookie] == nil {
		t.Fatal("the CSRF cookie was not cleared")
	}
	for name, cookie := range cookies {
		if cookie.Value != "" {
			t.Errorf("the cleared %s cookie still carries the value %q", name, cookie.Value)
		}
		if cookie.MaxAge >= 0 {
			t.Errorf("the cleared %s cookie has MaxAge %d, want a negative value", name, cookie.MaxAge)
		}
	}
}

// TestRevokeAllSessionsInvalidatesEverySessionOfThatUser checks that every
// session of one user dies while the sessions of other users survive.
func TestRevokeAllSessionsInvalidatesEverySessionOfThatUser(t *testing.T) {
	rig := newRig(t)
	alice := rig.createUser("alice")
	bob := rig.createUser("bob")

	aliceCookie1, _, aliceRow1 := rig.createSession(alice)
	aliceCookie2, _, aliceRow2 := rig.createSession(alice)
	bobCookie, _, _ := rig.createSession(bob)

	if err := rig.svc.RevokeAllSessions(alice.ID); err != nil {
		t.Fatalf("RevokeAllSessions: %v", err)
	}

	for i, cookie := range []string{aliceCookie1, aliceCookie2} {
		rec := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: cookie}, nil)
		requireStatus(t, rec, http.StatusUnauthorized, "a revoked session of alice")
		requireNotReached(t, rec, "a revoked session of alice")
		_ = i
	}

	other := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: bobCookie}, nil)
	requireStatus(t, other, http.StatusOK, "the session of bob")
	if other.Header().Get("X-Probe") != "ok" {
		t.Error("the protected handler did not run for bob")
	}

	for _, id := range []uint{aliceRow1.ID, aliceRow2.ID} {
		var stored models.Session
		if err := rig.db.First(&stored, id).Error; err != nil {
			t.Fatalf("reload session %d: %v", id, err)
		}
		if stored.RevokedAt == nil {
			t.Errorf("session %d of alice was not revoked", id)
		}
	}
}

// TestRequireCSRFRejectsAMissingToken checks that a state changing request
// without a CSRF token is refused.
func TestRequireCSRFRejectsAMissingToken(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	cookie, _, _ := rig.createSession(user)

	cases := []struct {
		name    string
		cookies map[string]string
		headers map[string]string
		want    int
	}{
		{"no token", map[string]string{SessionCookie: cookie}, nil, http.StatusForbidden},
		{"empty token header", map[string]string{SessionCookie: cookie}, map[string]string{CSRFHeader: ""}, http.StatusForbidden},
		{"no session", nil, nil, http.StatusUnauthorized},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := rig.do(http.MethodPost, "/csrf/probe", tc.cookies, tc.headers)
			requireStatus(t, rec, tc.want, "request without a CSRF token")
			requireNotReached(t, rec, "request without a CSRF token")
			if tc.want == http.StatusForbidden {
				if code := errorCode(t, rec); code != "forbidden" {
					t.Errorf("error code = %q, want forbidden", code)
				}
			}
		})
	}
}

// TestRequireCSRFRejectsAMismatchedToken checks that a wrong CSRF token is
// refused.
func TestRequireCSRFRejectsAMismatchedToken(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	other := rig.createUser("bob")
	cookie, csrf, _ := rig.createSession(user)
	_, otherCSRF, _ := rig.createSession(other)

	cases := []struct {
		name  string
		token string
	}{
		{"wrong token", csrf + "x"},
		{"token of another session", otherCSRF},
		{"prefix of the token", csrf[:4]},
		{"token without the last character", csrf[:len(csrf)-1]},
		{"whitespace", " "},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := rig.do(http.MethodPost, "/csrf/probe",
				map[string]string{SessionCookie: cookie},
				map[string]string{CSRFHeader: tc.token})
			requireStatus(t, rec, http.StatusForbidden, "request with a wrong CSRF token")
			requireNotReached(t, rec, "request with a wrong CSRF token")
			if code := errorCode(t, rec); code != "forbidden" {
				t.Errorf("error code = %q, want forbidden", code)
			}
		})
	}
}

// TestRequireCSRFAllowsSafeMethodsWithoutAToken checks which methods are
// exempt from the CSRF check and that a correct token is accepted.
func TestRequireCSRFAllowsSafeMethodsWithoutAToken(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	cookie, csrf, _ := rig.createSession(user)

	for _, method := range []string{http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace} {
		t.Run("safe method "+method, func(t *testing.T) {
			rec := rig.do(method, "/csrf/probe", nil, nil)
			requireStatus(t, rec, http.StatusOK, "safe method without a CSRF token")
			if rec.Header().Get("X-Probe") != "ok" {
				t.Error("the handler did not run for a safe method")
			}
		})
	}

	for _, method := range []string{http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete} {
		t.Run("unsafe method "+method, func(t *testing.T) {
			rec := rig.do(method, "/csrf/probe", map[string]string{SessionCookie: cookie}, nil)
			requireStatus(t, rec, http.StatusForbidden, "unsafe method without a CSRF token")
			requireNotReached(t, rec, "unsafe method without a CSRF token")
		})
	}

	t.Run("correct token in the header", func(t *testing.T) {
		rec := rig.do(http.MethodPost, "/csrf/probe",
			map[string]string{SessionCookie: cookie},
			map[string]string{CSRFHeader: csrf})
		requireStatus(t, rec, http.StatusOK, "request with the correct CSRF token")
		if rec.Header().Get("X-Probe") != "ok" {
			t.Error("the handler did not run for a correct CSRF token")
		}
	})

	t.Run("correct token in the form body", func(t *testing.T) {
		rec := rig.doForm(http.MethodPost, "/csrf/probe",
			map[string]string{SessionCookie: cookie},
			url.Values{"csrfToken": {csrf}})
		requireStatus(t, rec, http.StatusOK, "request with the correct CSRF token in the form body")
		if rec.Header().Get("X-Probe") != "ok" {
			t.Error("the handler did not run for a correct CSRF token in the form body")
		}
	})
}

// TestAuthenticateRejectsADisabledAccount checks that a valid session of a
// disabled account is refused.
func TestAuthenticateRejectsADisabledAccount(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	cookie, _, _ := rig.createSession(user)

	if err := rig.db.Model(&models.User{}).Where("id = ?", user.ID).Update("disabled", true).Error; err != nil {
		t.Fatalf("disable user: %v", err)
	}

	rec := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: cookie}, nil)
	requireStatus(t, rec, http.StatusForbidden, "a disabled account")
	requireNotReached(t, rec, "a disabled account")
	if code := errorCode(t, rec); code != "forbidden" {
		t.Errorf("error code = %q, want forbidden", code)
	}
}

// TestLoginLimiterBlocksAfterTheLimit checks the fixed window login limiter.
func TestLoginLimiterBlocksAfterTheLimit(t *testing.T) {
	const limit = 3
	limiter := NewLimiter(limit, time.Minute)
	key := "alice@example.com"

	for i := 1; i <= limit; i++ {
		if !limiter.Allow(key) {
			t.Fatalf("attempt %d of %d was refused, want allowed", i, limit)
		}
	}
	if limiter.Allow(key) {
		t.Fatalf("attempt %d was allowed, the limiter must block after %d attempts", limit+1, limit)
	}

	// A different key has its own budget.
	if !limiter.Allow("bob@example.com") {
		t.Fatal("a different key was refused")
	}

	// Reset frees the key again.
	limiter.Reset(key)
	if !limiter.Allow(key) {
		t.Fatal("the key was still blocked after Reset")
	}

	// The window expires on its own.
	short := NewLimiter(1, 20*time.Millisecond)
	if !short.Allow(key) {
		t.Fatal("the first attempt was refused")
	}
	if short.Allow(key) {
		t.Fatal("the second attempt was allowed")
	}
	time.Sleep(80 * time.Millisecond)
	if !short.Allow(key) {
		t.Fatal("the key was still blocked after the window elapsed")
	}

	// The service exposes the same limiter with a limit of 10 attempts.
	rig := newRig(t)
	for i := 1; i <= 10; i++ {
		if !rig.svc.AllowLogin(key) {
			t.Fatalf("login attempt %d of 10 was refused, want allowed", i)
		}
	}
	if rig.svc.AllowLogin(key) {
		t.Fatal("login attempt 11 was allowed, the limiter must block after 10 attempts")
	}
	rig.svc.ResetLogin(key)
	if !rig.svc.AllowLogin(key) {
		t.Fatal("the key was still blocked after ResetLogin")
	}
}

// TestAnIdleSessionHasToBeRenewed checks that a session which has not been
// used for longer than the session lifetime is refused with the code that
// tells the client to renew it.
func TestAnIdleSessionHasToBeRenewed(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	value, _, session := rig.createSession(user)

	// The session was used an hour and a half ago, and the session lifetime
	// of the rig is one hour.
	rig.db.Model(&models.Session{}).Where("id = ?", session.ID).
		Update("last_seen_at", time.Now().UTC().Add(-90*time.Minute))

	rec := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: value}, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("an idle session was accepted: %d", rec.Code)
	}
	if code := errorCode(t, rec); code != "session_expired" {
		t.Fatalf("the error code is %q, want session_expired", code)
	}
}

// TestARenewedSessionWorksAgain checks that the renewal endpoint brings an
// idle session back to life, which is what the client does after it is told
// that the session has to be renewed.
func TestARenewedSessionWorksAgain(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	value, _, session := rig.createSession(user)

	rig.db.Model(&models.Session{}).Where("id = ?", session.ID).
		Update("last_seen_at", time.Now().UTC().Add(-90*time.Minute))

	rec := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: value}, nil)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("an idle session was accepted: %d", rec.Code)
	}

	// The rotation itself is not behind the authentication middleware, so
	// an idle session can still be renewed. The rotation hands out a new
	// secret, so the client has to use the new cookie.
	c, rotateRec := rig.contextWithCookie(value)
	if _, err := rig.svc.RotateSession(c); err != nil {
		t.Fatalf("RotateSession: %v", err)
	}
	renewed := cookiesByName(rotateRec, SessionCookie)[SessionCookie]
	if renewed == nil || renewed.Value == "" {
		t.Fatal("the rotation did not set a new session cookie")
	}

	rec = rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: renewed.Value}, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("the renewed session was refused: %d", rec.Code)
	}
}

// TestRenewalSlidesTheExpiryForward checks that renewing a session measures
// the new deadline from the renewal itself, not from the original sign-in.
func TestRenewalSlidesTheExpiryForward(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	value, _, session := rig.createSession(user)

	// The session was created almost a full refresh window ago. Renewing it
	// has to hand out another full window, not the sliver that remains.
	created := time.Now().UTC().Add(-23 * time.Hour)
	rig.db.Model(&models.Session{}).Where("id = ?", session.ID).Updates(map[string]any{
		"created_at":   created,
		"last_seen_at": time.Now().UTC(),
	})

	c, _ := rig.contextWithCookie(value)
	info, err := rig.svc.RotateSession(c)
	if err != nil {
		t.Fatalf("RotateSession: %v", err)
	}
	if !info.ExpiresAt.After(created.Add(24 * time.Hour)) {
		t.Fatalf("the renewed session expires at %s, which does not slide past the original window", info.ExpiresAt)
	}
}

// TestASessionPastItsExpiryCannotBeRenewed checks that a cookie whose
// deadline has already passed is not given a new life.
func TestASessionPastItsExpiryCannotBeRenewed(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	value, _, session := rig.createSession(user)

	rig.db.Model(&models.Session{}).Where("id = ?", session.ID).Updates(map[string]any{
		"expires_at":   time.Now().UTC().Add(-time.Hour),
		"last_seen_at": time.Now().UTC(),
	})

	c, _ := rig.contextWithCookie(value)
	if _, err := rig.svc.RotateSession(c); !errors.Is(err, ErrSessionExpired) {
		t.Fatalf("RotateSession error = %v, want %v", err, ErrSessionExpired)
	}
}

// TestActivitySlidesTheSession checks that ordinary use, not only an explicit
// renewal, pushes the deadline forward and rewrites the cookie to match.
func TestActivitySlidesTheSession(t *testing.T) {
	rig := newRig(t)
	user := rig.createUser("alice")
	value, _, session := rig.createSession(user)

	earlier := time.Now().UTC().Add(-30 * time.Minute)
	rig.db.Model(&models.Session{}).Where("id = ?", session.ID).Updates(map[string]any{
		"last_seen_at": earlier,
		"expires_at":   earlier.Add(24 * time.Hour),
	})

	rec := rig.do(http.MethodGet, "/auth/probe", map[string]string{SessionCookie: value}, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("an active session was refused: %d", rec.Code)
	}
	if cookiesByName(rec, SessionCookie)[SessionCookie] == nil {
		t.Fatal("activity did not rewrite the session cookie")
	}

	var row models.Session
	if err := rig.db.Where("id = ?", session.ID).First(&row).Error; err != nil {
		t.Fatalf("load session: %v", err)
	}
	if !row.ExpiresAt.After(time.Now().UTC().Add(23 * time.Hour)) {
		t.Fatalf("expires_at = %s, want it slid by a refresh window", row.ExpiresAt)
	}
}
