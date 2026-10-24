// Command server runs the journal backend: the HTTP API, the background
// workers and the database migrations.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/wei/journal/backend/internal/ai"
	"github.com/wei/journal/backend/internal/api"
	"github.com/wei/journal/backend/internal/auth"
	"github.com/wei/journal/backend/internal/bootstrap"
	"github.com/wei/journal/backend/internal/config"
	"github.com/wei/journal/backend/internal/db"
	"github.com/wei/journal/backend/internal/geocode"
	"github.com/wei/journal/backend/internal/indexer"
	"github.com/wei/journal/backend/internal/jobs"
	"github.com/wei/journal/backend/internal/media"
	"github.com/wei/journal/backend/internal/search"
	"github.com/wei/journal/backend/internal/worker"
)

// version is stamped at build time with -ldflags "-X main.version=...".
var version = "dev"

func main() {
	if err := run(); err != nil {
		slog.Error("fatal", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	// The effective version decides the log level and the web framework's
	// mode, so an image that is stamped is never run in debug mode.
	appVersion := effectiveVersion(version, cfg.Version)

	log := newLogger(appVersion)
	slog.SetDefault(log)

	handle, err := db.Open(cfg.DatabaseURL, log)
	if err != nil {
		return err
	}
	defer handle.Close()

	storage, err := media.NewStorage(cfg.UploadDir, cfg.DerivedDir, cfg.MaxUploadBytes)
	if err != nil {
		return err
	}

	searchService := search.NewService(handle.DB(), handle.Dialect)
	idx := indexer.New(handle.DB(), searchService)
	authService := auth.NewService(handle.DB(), cfg.SessionTTL, cfg.RefreshTTL, cfg.CookieSecure, cfg.CookieDomain)
	queue := jobs.NewQueue(handle.DB(), log)

	provider := buildProvider(cfg)
	geocoder := buildGeocoder(cfg, log)

	if err := bootstrap.EnsureAdmin(handle.DB(), log, bootstrap.Admin{
		Username: cfg.AdminUsername,
		Password: cfg.AdminPassword,
		Email:    cfg.AdminEmail,
	}); err != nil {
		return err
	}
	if err := bootstrap.PurgeExpiredSessions(handle.DB(), log); err != nil {
		log.Warn("purge expired sessions failed", "error", err)
	}

	server := api.NewServer(api.Options{
		Config:   cfg,
		Handle:   handle,
		Logger:   log,
		Auth:     authService,
		Search:   searchService,
		Indexer:  idx,
		Storage:  storage,
		Queue:    queue,
		Provider: provider,
		Geocoder: geocoder,
		Version:  appVersion,
	})

	jobWorker := jobs.NewWorker(queue, log, cfg.JobWorkers, cfg.JobInterval)
	worker.New(worker.Options{
		DB:          handle.DB(),
		Logger:      log,
		Storage:     storage,
		Provider:    provider,
		Indexer:     idx,
		VisionModel: cfg.OpenAIVision,
		TextModel:   cfg.OpenAIText,
	}).Register(jobWorker)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	jobWorker.Start(ctx)
	log.Info("background workers started", "workers", cfg.JobWorkers)

	router := server.Router()
	if err := configureTrustedProxies(router, cfg); err != nil {
		return err
	}

	httpServer := &http.Server{
		Addr:              cfg.Addr,
		Handler:           router,
		ReadHeaderTimeout: 15 * time.Second,
		ReadTimeout:       5 * time.Minute,
		WriteTimeout:      5 * time.Minute,
		IdleTimeout:       2 * time.Minute,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Info("listening", "addr", cfg.Addr, "version", appVersion)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		log.Info("shutting down")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		log.Warn("http shutdown failed", "error", err)
	}
	return nil
}

// effectiveVersion resolves the version the process reports. The build stamp
// is the exact version of the binary; a binary that was not stamped falls back
// to the configured version, so a local run and a container never report two
// different names for the same build.
func effectiveVersion(stamped, configured string) string {
	if stamped != "" && stamped != "dev" {
		return stamped
	}
	if configured != "" {
		return configured
	}
	return stamped
}

// buildProvider returns the configured model provider, or a disabled one when
// no credentials are present. The journal works without a model; only the
// derived metadata is unavailable.
func buildProvider(cfg *config.Config) ai.Provider {
	if !cfg.AIConfigured() {
		return ai.NewDisabledProvider()
	}
	return ai.NewOpenAIProvider(ai.OpenAIConfig{
		APIKey:      cfg.OpenAIAPIKey,
		BaseURL:     cfg.OpenAIBaseURL,
		VisionModel: cfg.OpenAIVision,
		TextModel:   cfg.OpenAIText,
		Timeout:     cfg.AIRequestTimout,
	})
}

// buildGeocoder returns the configured place service, or a disabled one
// when nothing is set up. The journal works without it; only the search by
// name is missing.
func buildGeocoder(cfg *config.Config, log *slog.Logger) geocode.Geocoder {
	switch strings.ToLower(strings.TrimSpace(cfg.GeocodingProvider)) {
	case "amap":
		amap := geocode.NewAmap(cfg.AmapKey, cfg.AmapSecret, "")
		amap.CityCode = cfg.AmapCity
		if amap.Available() {
			return amap
		}
		log.Warn("amap is selected but no key is set; place search stays off")
		return geocode.NewDisabled()
	default:
		nominatim := geocode.NewNominatim(cfg.GeocodingURL, cfg.GeocodingUserAgent)
		if nominatim.Available() {
			return nominatim
		}
		return geocode.NewDisabled()
	}
}

// newLogger builds the structured logger used across the process.
func newLogger(version string) *slog.Logger {
	level := slog.LevelInfo
	if os.Getenv("WJ_LOG_LEVEL") == "debug" || version == "dev" {
		level = slog.LevelDebug
	}
	opts := &slog.HandlerOptions{Level: level}
	if os.Getenv("WJ_LOG_FORMAT") == "json" {
		return slog.New(slog.NewJSONHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, opts))
}

// defaultTrustedProxies are the peers whose forwarding headers are believed
// when a reverse proxy is in front of the server and no explicit list is
// given: the loopback interface and the private bridge a container network
// uses. Nothing outside the local machine or the private bridge is trusted,
// so a client that can reach the server directly cannot pretend to be
// somebody else with an X-Forwarded-For header.
var defaultTrustedProxies = []string{
	"127.0.0.1/32",
	"::1/128",
	"172.16.0.0/12",
}

// configureTrustedProxies decides whose X-Forwarded-For header the client
// address is taken from.
//
// Gin trusts every proxy until it is told otherwise, so the default here is
// to trust nobody: a direct connection then reports the real peer address.
// Trusting a proxy is opt in, and only the listed peers are believed.
func configureTrustedProxies(router *gin.Engine, cfg *config.Config) error {
	switch {
	case len(cfg.TrustedProxyCIDRs) > 0:
		return router.SetTrustedProxies(cfg.TrustedProxyCIDRs)
	case cfg.TrustedProxy:
		return router.SetTrustedProxies(defaultTrustedProxies)
	default:
		return router.SetTrustedProxies(nil)
	}
}
