// Package api exposes the HTTP interface of the journal.
package api

import (
	"context"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/wei/journal/backend/internal/ai"
	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/config"
	"github.com/wei/journal/backend/internal/db"
	"github.com/wei/journal/backend/internal/httpx"
	"github.com/wei/journal/backend/internal/indexer"
	"github.com/wei/journal/backend/internal/jobs"
	"github.com/wei/journal/backend/internal/media"
	"github.com/wei/journal/backend/internal/search"
)

// Server holds every dependency the HTTP handlers need.
type Server struct {
	cfg      *config.Config
	handle   *db.Handle
	log      *slog.Logger
	auth     *auth.Service
	search   *search.Service
	index    *indexer.Indexer
	storage  *media.Storage
	queue    *jobs.Queue
	provider ai.Provider
	limiter  *auth.Limiter
	version  string
}

// Options carries the dependencies for building a Server.
type Options struct {
	Config   *config.Config
	Handle   *db.Handle
	Logger   *slog.Logger
	Auth     *auth.Service
	Search   *search.Service
	Indexer  *indexer.Indexer
	Storage  *media.Storage
	Queue    *jobs.Queue
	Provider ai.Provider
	Version  string
}

// NewServer builds the API server.
func NewServer(opts Options) *Server {
	return &Server{
		cfg:      opts.Config,
		handle:   opts.Handle,
		log:      opts.Logger,
		auth:     opts.Auth,
		search:   opts.Search,
		index:    opts.Indexer,
		storage:  opts.Storage,
		queue:    opts.Queue,
		provider: opts.Provider,
		limiter:  auth.NewLimiter(opts.Config.RateLimitPerMin, time.Minute),
		version:  opts.Version,
	}
}

// Router builds the HTTP router.
func (s *Server) Router() *gin.Engine {
	// The effective version is the build stamp, not the configured string.
	// A container that was built for a release therefore never runs in the
	// framework's debug mode, even when WJ_VERSION was left unset.
	if s.version == "dev" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.New()
	r.RedirectTrailingSlash = true
	r.Use(s.securityHeaders())
	r.Use(s.requestLogger())
	r.Use(s.cors())
	r.Use(s.rateLimit())

	r.NoRoute(func(c *gin.Context) {
		httpx.NotFound(c, "endpoint not found")
	})
	r.NoMethod(func(c *gin.Context) {
		httpx.Fail(c, http.StatusMethodNotAllowed, &httpx.Error{
			Code: httpx.CodeNotFound, Message: "method not allowed",
		})
	})

	api := r.Group("/api")
	api.GET("/health", s.handleHealth)
	api.HEAD("/health", s.handleHealth)
	api.GET("/health/ready", s.handleReady)
	api.HEAD("/health/ready", s.handleReady)

	authGroup := api.Group("/auth")
	authGroup.POST("/register", s.handleRegister)
	authGroup.POST("/login", s.handleLogin)
	authGroup.POST("/refresh", s.handleRefresh)

	authed := authGroup.Group("")
	authed.Use(s.auth.Authenticate())
	authed.Use(s.auth.RequireCSRF())
	authed.POST("/logout", s.handleLogout)
	authed.GET("/me", s.handleMe)
	authed.POST("/password", s.handleChangePassword)
	authed.GET("/sessions", s.handleListSessions)
	authed.DELETE("/sessions/:id", s.handleRevokeSession)

	secure := api.Group("")
	secure.Use(s.auth.Authenticate())
	secure.Use(s.auth.RequireCSRF())

	secure.GET("/entries", s.handleListEntries)
	secure.POST("/entries", s.handleCreateEntry)
	secure.GET("/entries/:id", s.handleGetEntry)
	secure.PATCH("/entries/:id", s.handleUpdateEntry)
	secure.DELETE("/entries/:id", s.handleDeleteEntry)
	secure.POST("/entries/:id/location", s.handleSetEntryLocation)
	secure.DELETE("/entries/:id/location", s.handleDeleteEntryLocation)

	secure.GET("/folders", s.handleListFolders)
	secure.POST("/folders", s.handleCreateFolder)
	secure.PATCH("/folders/:id", s.handleUpdateFolder)
	secure.DELETE("/folders/:id", s.handleDeleteFolder)
	secure.POST("/folders/reorder", s.handleReorderFolders)

	secure.GET("/tags", s.handleListTags)
	secure.POST("/tags", s.handleCreateTag)
	secure.PATCH("/tags/:id", s.handleUpdateTag)
	secure.DELETE("/tags/:id", s.handleDeleteTag)

	secure.GET("/media", s.handleListMedia)
	secure.POST("/media", s.handleUploadMedia)
	secure.POST("/media/live", s.handleUploadLivePhoto)
	secure.GET("/media/:id", s.handleGetMedia)
	secure.PATCH("/media/:id", s.handleUpdateMedia)
	secure.DELETE("/media/:id", s.handleDeleteMedia)
	secure.POST("/media/:id/link", s.handleLinkLivePhoto)
	secure.GET("/media/:id/file", s.handleMediaFile)
	secure.GET("/media/:id/thumb", s.handleMediaThumb)
	secure.GET("/media/:id/preview", s.handleMediaPreview)

	secure.GET("/search", s.handleSearch)
	secure.GET("/calendar", s.handleCalendar)
	secure.GET("/stats", s.handleStats)
	secure.GET("/locations", s.handleListLocations)
	secure.GET("/locations/search", s.handleGeocode)
	secure.GET("/locations/own", s.handleSearchOwnLocations)
	secure.GET("/locations/reverse", s.handleReverseGeocode)
	secure.GET("/locations/capabilities", s.handleLocationCapabilities)

	secure.POST("/batch", s.handleBatch)
	secure.POST("/batch/preview", s.handleBatchPreview)

	secure.GET("/settings", s.handleGetSettings)
	secure.PATCH("/settings", s.handleUpdateSettings)

	secure.GET("/ai/status", s.handleAIStatus)
	secure.GET("/ai/metadata", s.handleAIMetadata)
	secure.POST("/ai/reprocess", s.handleAIReprocess)

	secure.GET("/export", s.handleExport)

	return r
}

func (s *Server) securityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Permissions-Policy", "geolocation=(self), camera=(self), microphone=()")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		c.Next()
	}
}

func (s *Server) requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		c.Next()
		status := c.Writer.Status()
		if status >= 400 || strings.HasPrefix(path, "/api/") {
			attrs := []any{
				"method", c.Request.Method,
				"path", path,
				"status", status,
				"duration", time.Since(start).Milliseconds(),
			}
			if user := auth.CurrentUser(c); user != nil {
				attrs = append(attrs, "user", user.Username)
			}
			if status >= 500 {
				s.log.Error("request", attrs...)
			} else {
				s.log.Info("request", attrs...)
			}
		}
	}
}

// cors allows the configured origins only. Same origin deployments need no
// CORS headers at all.
func (s *Server) cors() gin.HandlerFunc {
	allowed := map[string]bool{}
	for _, o := range s.cfg.TrustedOrigins {
		allowed[strings.TrimRight(o, "/")] = true
	}
	return func(c *gin.Context) {
		origin := strings.TrimRight(c.GetHeader("Origin"), "/")
		if origin != "" && allowed[origin] {
			h := c.Writer.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Set("Access-Control-Allow-Credentials", "true")
			h.Set("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
			h.Set("Vary", "Origin")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}

// rateLimit applies a per identity request budget.
func (s *Server) rateLimit() gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.ClientIP()
		if user := auth.CurrentUser(c); user != nil {
			key = "u:" + strconv.FormatUint(uint64(user.ID), 10)
		}
		if !s.limiter.Allow(key) {
			httpx.Fail(c, http.StatusTooManyRequests, &httpx.Error{
				Code:    httpx.CodeRateLimit,
				Message: "too many requests, please slow down",
			})
			return
		}
		c.Next()
	}
}

// authenticate is a small helper so the router reads uniformly.
func (s *Server) authenticate(h gin.HandlerFunc) gin.HandlerFunc { return s.auth.Authenticate() }

// requireCSRF is a small helper so the router reads uniformly.
func (s *Server) requireCSRF() gin.HandlerFunc { return s.auth.RequireCSRF() }

// Shutdown releases server resources.
func (s *Server) Shutdown(ctx context.Context) error { return nil }
