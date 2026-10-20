package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/wei/journal/backend/internal/ai"
	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/config"
	"github.com/wei/journal/backend/internal/db"
	"github.com/wei/journal/backend/internal/indexer"
	"github.com/wei/journal/backend/internal/jobs"
	"github.com/wei/journal/backend/internal/media"
	"github.com/wei/journal/backend/internal/search"
)

// harness is a running API server backed by a temporary database.
type harness struct {
	t       *testing.T
	server  *Server
	handle  *db.Handle
	storage *media.Storage
	queue   *jobs.Queue
	search  *search.Service
	index   *indexer.Indexer
	dir     string
}

// newHarness boots an isolated server for one test.
func newHarness(t *testing.T) *harness {
	t.Helper()
	gin.SetMode(gin.TestMode)

	dir := t.TempDir()
	logOut := io.Discard
	if os.Getenv("WJ_TEST_VERBOSE") != "" {
		logOut = os.Stderr
	}
	log := slog.New(slog.NewTextHandler(logOut, nil))

	cfg := &config.Config{
		Addr:            ":0",
		DatabaseURL:     "sqlite://" + filepath.Join(dir, "test.db"),
		DataDir:         dir,
		UploadDir:       filepath.Join(dir, "uploads"),
		DerivedDir:      filepath.Join(dir, "derived"),
		SessionTTL:      time.Hour,
		RefreshTTL:      24 * time.Hour,
		AllowRegister:   true,
		MaxUploadBytes:  8 << 20,
		JobWorkers:      1,
		JobInterval:     50 * time.Millisecond,
		RateLimitPerMin: 10000,
		Version:         "test",
		OpenAIVision:    "test-vision",
		OpenAIText:      "test-text",
	}

	handle, err := db.Open(cfg.DatabaseURL, log)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { handle.Close() })

	storage, err := media.NewStorage(cfg.UploadDir, cfg.DerivedDir, cfg.MaxUploadBytes)
	if err != nil {
		t.Fatalf("create storage: %v", err)
	}
	searchService := search.NewService(handle.DB(), handle.Dialect)
	idx := indexer.New(handle.DB(), searchService)
	authService := auth.NewService(handle.DB(), cfg.SessionTTL, cfg.RefreshTTL, false, "")
	queue := jobs.NewQueue(handle.DB(), log)

	server := NewServer(Options{
		Config:   cfg,
		Handle:   handle,
		Logger:   log,
		Auth:     authService,
		Search:   searchService,
		Indexer:  idx,
		Storage:  storage,
		Queue:    queue,
		Provider: ai.NewDisabledProvider(),
		Version:  "test",
	})

	return &harness{
		t:       t,
		server:  server,
		handle:  handle,
		storage: storage,
		queue:   queue,
		search:  searchService,
		index:   idx,
		dir:     dir,
	}
}

// client is a signed in user with its own cookie jar.
type client struct {
	t       *testing.T
	h       *harness
	cookies map[string]string
	csrf    string
	userID  uint
}

// register creates an account and returns a signed in client.
func (h *harness) register(username, password string) *client {
	h.t.Helper()
	c := &client{t: h.t, h: h, cookies: map[string]string{}}
	body := map[string]string{"username": username, "password": password}
	resp := c.do(http.MethodPost, "/api/auth/register", body, "")
	if resp.status != http.StatusCreated {
		h.t.Fatalf("register %s: status %d body %s", username, resp.status, resp.body)
	}
	var payload struct {
		Data struct {
			CSRFToken string `json:"csrfToken"`
			User      struct {
				ID uint `json:"id"`
			} `json:"user"`
		} `json:"data"`
	}
	decode(h.t, resp.body, &payload)
	c.csrf = payload.Data.CSRFToken
	c.userID = payload.Data.User.ID
	return c
}

// response is a decoded HTTP response.
type response struct {
	status int
	body   []byte
	header http.Header
}

// json decodes the data envelope of a response.
func (r response) json(t *testing.T, target any) {
	t.Helper()
	var envelope struct {
		Data  json.RawMessage `json:"data"`
		Error *struct {
			Code    string            `json:"code"`
			Message string            `json:"message"`
			Details map[string]string `json:"details"`
		} `json:"error"`
		Meta *struct {
			NextCursor string `json:"nextCursor"`
			HasMore    bool   `json:"hasMore"`
		} `json:"meta"`
	}
	decode(t, r.body, &envelope)
	if target != nil {
		if len(envelope.Data) == 0 {
			t.Fatalf("response has no data: %s", r.body)
		}
		if err := json.Unmarshal(envelope.Data, target); err != nil {
			t.Fatalf("decode data: %v (%s)", err, r.body)
		}
	}
}

// errorCode returns the machine readable error code of a response.
func (r response) errorCode(t *testing.T) string {
	t.Helper()
	var envelope struct {
		Error *struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	decode(t, r.body, &envelope)
	if envelope.Error == nil {
		return ""
	}
	return envelope.Error.Code
}

// nextCursor returns the pagination cursor of a response.
func (r response) nextCursor(t *testing.T) string {
	t.Helper()
	var envelope struct {
		Meta *struct {
			NextCursor string `json:"nextCursor"`
		} `json:"meta"`
	}
	decode(t, r.body, &envelope)
	if envelope.Meta == nil {
		return ""
	}
	return envelope.Meta.NextCursor
}

// csrfNone makes a request omit the CSRF token entirely.
const csrfNone = "-omit-csrf-"

// do performs a request with the client's cookies and CSRF token. An empty
// csrf argument uses the client's own token; csrfNone omits the header.
func (c *client) do(method, path string, body any, csrf string) response {
	c.t.Helper()
	var reader io.Reader
	switch payload := body.(type) {
	case nil:
	case []byte:
		reader = bytes.NewReader(payload)
	default:
		encoded, err := json.Marshal(payload)
		if err != nil {
			c.t.Fatalf("encode request: %v", err)
		}
		reader = bytes.NewReader(encoded)
	}

	req := httptest.NewRequest(method, path, reader)
	if reader != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for name, value := range c.cookies {
		req.AddCookie(&http.Cookie{Name: name, Value: value})
	}
	if csrf == csrfNone {
		csrf = ""
	} else if csrf == "" {
		csrf = c.csrf
	}
	if csrf != "" {
		req.Header.Set("X-CSRF-Token", csrf)
	}

	rec := httptest.NewRecorder()
	c.h.server.Router().ServeHTTP(rec, req)

	for _, cookie := range rec.Result().Cookies() {
		if cookie.Value == "" {
			delete(c.cookies, cookie.Name)
			continue
		}
		c.cookies[cookie.Name] = cookie.Value
	}
	return response{status: rec.Code, body: rec.Body.Bytes(), header: rec.Header()}
}

// upload posts a multipart file and returns the raw response.
func (c *client) upload(path, field, filename string, content []byte, extra map[string]string) response {
	c.t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, err := writer.CreateFormFile(field, filename)
	if err != nil {
		c.t.Fatalf("create form file: %v", err)
	}
	part.Write(content)
	for key, value := range extra {
		writer.WriteField(key, value)
	}
	writer.Close()

	req := httptest.NewRequest(http.MethodPost, path, &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	for name, value := range c.cookies {
		req.AddCookie(&http.Cookie{Name: name, Value: value})
	}
	if c.csrf != "" {
		req.Header.Set("X-CSRF-Token", c.csrf)
	}
	rec := httptest.NewRecorder()
	c.h.server.Router().ServeHTTP(rec, req)
	return response{status: rec.Code, body: rec.Body.Bytes(), header: rec.Header()}
}

// uploadBinary posts raw bytes to a path, used for the media endpoints.
func (c *client) uploadBinary(path string, content []byte) response {
	c.t.Helper()
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(content))
	req.Header.Set("Content-Type", "application/octet-stream")
	for name, value := range c.cookies {
		req.AddCookie(&http.Cookie{Name: name, Value: value})
	}
	if c.csrf != "" {
		req.Header.Set("X-CSRF-Token", c.csrf)
	}
	rec := httptest.NewRecorder()
	c.h.server.Router().ServeHTTP(rec, req)
	return response{status: rec.Code, body: rec.Body.Bytes(), header: rec.Header()}
}

// get performs a request without a CSRF token, for read only endpoints.
func (c *client) get(path string) response {
	c.t.Helper()
	return c.do(http.MethodGet, path, nil, "")
}

func decode(t *testing.T, body []byte, target any) {
	t.Helper()
	if err := json.Unmarshal(body, target); err != nil {
		t.Fatalf("decode response %q: %v", string(body), err)
	}
}

// pngBytes builds a tiny valid PNG so image handling can be exercised.
func pngBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	img := newRGBAImage(w, h)
	return encodePNG(t, img)
}

// writeFile writes a file into the test directory.
func writeFile(t *testing.T, dir, name string, content []byte) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}

// doc builds a simple editor document with one paragraph.
func doc(text string) string {
	encoded, _ := json.Marshal(map[string]any{
		"type": "doc",
		"content": []any{
			map[string]any{
				"type": "paragraph",
				"content": []any{
					map[string]any{"type": "text", "text": text},
				},
			},
		},
	})
	return string(encoded)
}

// containsText reports whether the body mentions the given substring.
func containsText(body []byte, needle string) bool {
	return strings.Contains(string(body), needle)
}
