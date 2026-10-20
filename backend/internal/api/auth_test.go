package api

import (
	"net/http"
	"testing"
)

func TestRegisterFirstUserBecomesAdmin(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	var payload struct {
		User struct {
			Role string `json:"role"`
		} `json:"user"`
	}
	resp := c.get("/api/auth/me")
	resp.json(t, &payload)
	if payload.User.Role != "admin" {
		t.Fatalf("expected the first account to be an admin, got %q", payload.User.Role)
	}

	second := h.register("bob", "another good password")
	var secondPayload struct {
		User struct {
			Role string `json:"role"`
		} `json:"user"`
	}
	second.get("/api/auth/me").json(t, &secondPayload)
	if secondPayload.User.Role != "user" {
		t.Fatalf("expected the second account to be a regular user, got %q", secondPayload.User.Role)
	}
}

func TestRegisterValidation(t *testing.T) {
	h := newHarness(t)
	c := &client{t: t, h: h, cookies: map[string]string{}}

	cases := []struct {
		name string
		body map[string]string
	}{
		{"short username", map[string]string{"username": "ab", "password": "long enough password"}},
		{"bad username characters", map[string]string{"username": "a b/c", "password": "long enough password"}},
		{"short password", map[string]string{"username": "alice", "password": "short"}},
		{"empty username", map[string]string{"username": "", "password": "long enough password"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := c.do(http.MethodPost, "/api/auth/register", tc.body, "")
			if resp.status != http.StatusBadRequest {
				t.Fatalf("expected 400, got %d (%s)", resp.status, resp.body)
			}
			if code := resp.errorCode(t); code != "validation_error" {
				t.Fatalf("expected a validation error, got %q", code)
			}
		})
	}
}

func TestLoginRejectsWrongPassword(t *testing.T) {
	h := newHarness(t)
	h.register("alice", "correct horse battery")
	c := &client{t: t, h: h, cookies: map[string]string{}}

	resp := c.do(http.MethodPost, "/api/auth/login", map[string]string{
		"username": "alice", "password": "wrong password",
	}, "")
	if resp.status != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d (%s)", resp.status, resp.body)
	}
	// The message must not reveal whether the account exists.
	if !containsText(resp.body, "incorrect username or password") {
		t.Fatalf("expected a neutral error message, got %s", resp.body)
	}
}

func TestLoginUnknownUserLooksIdentical(t *testing.T) {
	h := newHarness(t)
	h.register("alice", "correct horse battery")
	c := &client{t: t, h: h, cookies: map[string]string{}}

	unknown := c.do(http.MethodPost, "/api/auth/login", map[string]string{
		"username": "nobody", "password": "wrong password",
	}, "")
	wrong := c.do(http.MethodPost, "/api/auth/login", map[string]string{
		"username": "alice", "password": "wrong password",
	}, "")
	if unknown.status != wrong.status {
		t.Fatalf("expected identical statuses, got %d and %d", unknown.status, wrong.status)
	}
	if string(unknown.body) != string(wrong.body) {
		t.Fatalf("expected identical bodies, got %s and %s", unknown.body, wrong.body)
	}
}

func TestUnauthenticatedRequestsAreRejected(t *testing.T) {
	h := newHarness(t)
	c := &client{t: t, h: h, cookies: map[string]string{}}

	for _, path := range []string{
		"/api/entries", "/api/folders", "/api/tags", "/api/media",
		"/api/search?q=test", "/api/stats", "/api/settings", "/api/export",
	} {
		resp := c.get(path)
		if resp.status != http.StatusUnauthorized {
			t.Fatalf("%s: expected 401, got %d", path, resp.status)
		}
	}
}

func TestCSRFIsRequiredForWrites(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/entries", map[string]string{"title": "x"}, csrfNone)
	if resp.status != http.StatusForbidden {
		t.Fatalf("expected 403, got %d (%s)", resp.status, resp.body)
	}
	if code := resp.errorCode(t); code != "forbidden" {
		t.Fatalf("expected a forbidden error, got %q", code)
	}
}

func TestLogoutRevokesTheSession(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	if resp := c.do(http.MethodPost, "/api/auth/logout", nil, ""); resp.status != http.StatusNoContent {
		t.Fatalf("expected 204, got %d (%s)", resp.status, resp.body)
	}
	if resp := c.get("/api/auth/me"); resp.status != http.StatusUnauthorized {
		t.Fatalf("expected the session to be revoked, got %d", resp.status)
	}
}

func TestChangePasswordRevokesOtherSessions(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	// A second device.
	other := &client{t: t, h: h, cookies: map[string]string{}}
	login := other.do(http.MethodPost, "/api/auth/login", map[string]string{
		"username": "alice", "password": "correct horse battery",
	}, "")
	if login.status != http.StatusOK {
		t.Fatalf("login: %d (%s)", login.status, login.body)
	}
	var payload struct {
		Data struct {
			CSRFToken string `json:"csrfToken"`
		} `json:"data"`
	}
	login.json(t, &payload)
	other.csrf = payload.Data.CSRFToken

	resp := c.do(http.MethodPost, "/api/auth/password", map[string]string{
		"currentPassword": "correct horse battery",
		"newPassword":     "a whole new password",
	}, "")
	if resp.status != http.StatusOK {
		t.Fatalf("change password: %d (%s)", resp.status, resp.body)
	}

	if got := other.get("/api/auth/me"); got.status != http.StatusUnauthorized {
		t.Fatalf("expected the other session to be revoked, got %d", got.status)
	}
	// The session that changed the password stays usable.
	if got := c.get("/api/auth/me"); got.status != http.StatusOK {
		t.Fatalf("expected the current session to survive, got %d", got.status)
	}
}

func TestChangePasswordRequiresTheCurrentOne(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	resp := c.do(http.MethodPost, "/api/auth/password", map[string]string{
		"currentPassword": "not the password",
		"newPassword":     "a whole new password",
	}, "")
	if resp.status != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d (%s)", resp.status, resp.body)
	}
}

func TestSessionRevocation(t *testing.T) {
	h := newHarness(t)
	c := h.register("alice", "correct horse battery")

	other := &client{t: t, h: h, cookies: map[string]string{}}
	login := other.do(http.MethodPost, "/api/auth/login", map[string]string{
		"username": "alice", "password": "correct horse battery",
	}, "")
	var payload struct {
		Data struct {
			CSRFToken string `json:"csrfToken"`
		} `json:"data"`
	}
	login.json(t, &payload)
	other.csrf = payload.Data.CSRFToken

	var sessions []struct {
		ID      uint `json:"id"`
		Current bool `json:"current"`
	}
	c.get("/api/auth/sessions").json(t, &sessions)
	if len(sessions) != 2 {
		t.Fatalf("expected two sessions, got %d", len(sessions))
	}
	var otherID uint
	for _, s := range sessions {
		if !s.Current {
			otherID = s.ID
		}
	}
	if otherID == 0 {
		t.Fatal("could not find the other session")
	}

	resp := c.do(http.MethodDelete, "/api/auth/sessions/"+itoa(otherID), nil, "")
	if resp.status != http.StatusNoContent {
		t.Fatalf("revoke: %d (%s)", resp.status, resp.body)
	}
	if got := other.get("/api/auth/me"); got.status != http.StatusUnauthorized {
		t.Fatalf("expected the revoked session to fail, got %d", got.status)
	}
}

func TestRegistrationCanBeDisabled(t *testing.T) {
	h := newHarness(t)
	h.server.cfg.AllowRegister = false
	c := &client{t: t, h: h, cookies: map[string]string{}}

	resp := c.do(http.MethodPost, "/api/auth/register", map[string]string{
		"username": "alice", "password": "correct horse battery",
	}, "")
	if resp.status != http.StatusForbidden {
		t.Fatalf("expected 403, got %d (%s)", resp.status, resp.body)
	}
}
