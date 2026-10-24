package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Config holds every runtime knob the server understands. Everything is
// sourced from the environment so a container can be configured without
// touching source files.
type Config struct {
	Addr               string
	DatabaseURL        string
	DataDir            string
	UploadDir          string
	DerivedDir         string
	SessionTTL         time.Duration
	RefreshTTL         time.Duration
	CookieSecure       bool
	CookieDomain       string
	AllowRegister      bool
	TrustedOrigins     []string
	MaxUploadBytes     int64
	AdminUsername      string
	AdminPassword      string
	AdminEmail         string
	EnableAI           bool
	OpenAIAPIKey       string
	OpenAIBaseURL      string
	OpenAIVision       string
	OpenAIText         string
	AIRequestTimout    time.Duration
	JobWorkers         int
	JobInterval        time.Duration
	RateLimitPerMin    int
	TrustedProxy       bool
	TrustedProxyCIDRs  []string
	Version            string
	GeocodingEnabled   bool
	GeocodingProvider  string
	GeocodingURL       string
	GeocodingUserAgent string
	AmapKey            string
	AmapCity           string
}

// Load reads configuration from the environment, applying defaults that make
// `docker compose up` work with only a minimal .env file.
func Load() (*Config, error) {
	c := &Config{
		Addr:               env("WJ_ADDR", ":8080"),
		DatabaseURL:        env("WJ_DATABASE_URL", ""),
		DataDir:            env("WJ_DATA_DIR", "./data"),
		SessionTTL:         envDuration("WJ_SESSION_TTL", 7*24*time.Hour),
		RefreshTTL:         envDuration("WJ_REFRESH_TTL", 30*24*time.Hour),
		CookieSecure:       envBool("WJ_COOKIE_SECURE", false),
		CookieDomain:       env("WJ_COOKIE_DOMAIN", ""),
		AllowRegister:      envBool("WJ_ALLOW_REGISTRATION", true),
		TrustedOrigins:     envList("WJ_TRUSTED_ORIGINS"),
		MaxUploadBytes:     int64(envInt("WJ_MAX_UPLOAD_MB", 256)) * 1024 * 1024,
		AdminUsername:      env("WJ_ADMIN_USERNAME", ""),
		AdminPassword:      env("WJ_ADMIN_PASSWORD", ""),
		AdminEmail:         env("WJ_ADMIN_EMAIL", ""),
		EnableAI:           envBool("WJ_AI_ENABLED", true),
		OpenAIAPIKey:       env("OPENAI_API_KEY", ""),
		OpenAIBaseURL:      env("OPENAI_BASE_URL", "https://api.openai.com/v1"),
		OpenAIVision:       env("OPENAI_VISION_MODEL", "gpt-4o-mini"),
		OpenAIText:         env("OPENAI_TEXT_MODEL", "gpt-4o-mini"),
		AIRequestTimout:    envDuration("WJ_AI_TIMEOUT", 90*time.Second),
		JobWorkers:         envInt("WJ_JOB_WORKERS", 2),
		JobInterval:        envDuration("WJ_JOB_INTERVAL", 2*time.Second),
		RateLimitPerMin:    envInt("WJ_RATE_LIMIT_PER_MIN", 120),
		TrustedProxy:       envBool("WJ_TRUSTED_PROXY", false),
		TrustedProxyCIDRs:  envList("WJ_TRUSTED_PROXY_CIDRS"),
		Version:            env("WJ_VERSION", "dev"),
		GeocodingEnabled:   envBool("WJ_GEOCODING_ENABLED", false),
		GeocodingProvider:  env("WJ_GEOCODING_PROVIDER", "nominatim"),
		GeocodingURL:       env("WJ_GEOCODING_URL", "https://nominatim.openstreetmap.org"),
		GeocodingUserAgent: env("WJ_GEOCODING_USER_AGENT", "wei-journal/1.0 (self-hosted journal)"),
		AmapKey:            env("WJ_AMAP_KEY", ""),
		AmapCity:           env("WJ_AMAP_CITY", ""),
	}

	if c.DatabaseURL == "" {
		c.DatabaseURL = "sqlite://" + filepath.Join(c.DataDir, "journal.db")
	}
	c.UploadDir = env("WJ_UPLOAD_DIR", filepath.Join(c.DataDir, "uploads"))
	c.DerivedDir = env("WJ_DERIVED_DIR", filepath.Join(c.DataDir, "derived"))

	if c.AdminPassword != "" && len(c.AdminPassword) < 10 {
		return nil, fmt.Errorf("config: WJ_ADMIN_PASSWORD must be at least 10 characters")
	}
	if c.MaxUploadBytes < 1024 {
		return nil, fmt.Errorf("config: WJ_MAX_UPLOAD_MB must be at least 1")
	}
	return c, nil
}

// IsSQLite reports whether the configured database is the embedded SQLite one.
func (c *Config) IsSQLite() bool { return strings.HasPrefix(c.DatabaseURL, "sqlite") }

// AIConfigured reports whether an external model provider is reachable given
// the current environment. When false the journal still works; only the AI
// derived metadata is unavailable.
func (c *Config) AIConfigured() bool {
	return c.EnableAI && strings.TrimSpace(c.OpenAIAPIKey) != ""
}

func env(key, def string) string {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v, ok := os.LookupEnv(key); ok {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return n
		}
	}
	return def
}

func envBool(key string, def bool) bool {
	if v, ok := os.LookupEnv(key); ok {
		if b, err := strconv.ParseBool(strings.TrimSpace(v)); err == nil {
			return b
		}
	}
	return def
}

func envDuration(key string, def time.Duration) time.Duration {
	if v, ok := os.LookupEnv(key); ok {
		if d, err := time.ParseDuration(strings.TrimSpace(v)); err == nil {
			return d
		}
	}
	return def
}

func envList(key string) []string {
	v, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(v) == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
