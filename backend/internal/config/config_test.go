package config

import (
	"strings"
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	t.Setenv("WJ_DATA_DIR", "/tmp/wj-config-default")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Addr != ":8080" {
		t.Errorf("Addr = %q, want :8080", cfg.Addr)
	}
	if want := "sqlite:///tmp/wj-config-default/journal.db"; cfg.DatabaseURL != want {
		t.Errorf("DatabaseURL = %q, want %q", cfg.DatabaseURL, want)
	}
	if cfg.UploadDir != "/tmp/wj-config-default/uploads" {
		t.Errorf("UploadDir = %q", cfg.UploadDir)
	}
	if cfg.DerivedDir != "/tmp/wj-config-default/derived" {
		t.Errorf("DerivedDir = %q", cfg.DerivedDir)
	}
	if !cfg.AllowRegister {
		t.Error("AllowRegister should default to true so the first account can be made")
	}
	if cfg.CookieSecure {
		t.Error("CookieSecure should default to false")
	}
	if cfg.TrustedProxy {
		t.Error("TrustedProxy should default to false")
	}
	if len(cfg.TrustedProxyCIDRs) != 0 {
		t.Errorf("TrustedProxyCIDRs = %v, want empty", cfg.TrustedProxyCIDRs)
	}
	if !cfg.IsSQLite() {
		t.Error("IsSQLite should be true for the default database URL")
	}
}

func TestLoadRejectsAShortAdminPassword(t *testing.T) {
	t.Setenv("WJ_ADMIN_PASSWORD", "short")

	_, err := Load()
	if err == nil {
		t.Fatal("Load should refuse a password shorter than 10 characters")
	}
	if !strings.Contains(err.Error(), "WJ_ADMIN_PASSWORD") {
		t.Errorf("error should name the variable, got %q", err)
	}
}

func TestLoadAcceptsAnAdminPasswordOfTenCharacters(t *testing.T) {
	t.Setenv("WJ_ADMIN_PASSWORD", "0123456789")

	if _, err := Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
}

func TestLoadRejectsAnUploadLimitBelowOneMegabyte(t *testing.T) {
	t.Setenv("WJ_MAX_UPLOAD_MB", "0")

	_, err := Load()
	if err == nil {
		t.Fatal("Load should refuse an upload limit below one megabyte")
	}
	if !strings.Contains(err.Error(), "WJ_MAX_UPLOAD_MB") {
		t.Errorf("error should name the variable, got %q", err)
	}
}

func TestLoadReadsTheEnvironment(t *testing.T) {
	t.Setenv("WJ_ADDR", ":9999")
	t.Setenv("WJ_DATABASE_URL", "postgres://journal:secret@db:5432/journal?sslmode=disable")
	t.Setenv("WJ_SESSION_TTL", "30m")
	t.Setenv("WJ_REFRESH_TTL", "48h")
	t.Setenv("WJ_COOKIE_SECURE", "true")
	t.Setenv("WJ_ALLOW_REGISTRATION", "false")
	t.Setenv("WJ_TRUSTED_PROXY", "true")
	t.Setenv("WJ_TRUSTED_PROXY_CIDRS", "10.0.0.0/8, 192.168.1.1 ,")
	t.Setenv("WJ_TRUSTED_ORIGINS", "https://journal.example, https://alt.example")
	t.Setenv("WJ_MAX_UPLOAD_MB", "10")
	t.Setenv("WJ_RATE_LIMIT_PER_MIN", "42")
	t.Setenv("WJ_LOG_LEVEL", "debug")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.Addr != ":9999" {
		t.Errorf("Addr = %q", cfg.Addr)
	}
	if cfg.IsSQLite() {
		t.Error("IsSQLite should be false for a PostgreSQL URL")
	}
	if cfg.SessionTTL != 30*time.Minute {
		t.Errorf("SessionTTL = %v", cfg.SessionTTL)
	}
	if cfg.RefreshTTL != 48*time.Hour {
		t.Errorf("RefreshTTL = %v", cfg.RefreshTTL)
	}
	if !cfg.CookieSecure {
		t.Error("CookieSecure should be true")
	}
	if cfg.AllowRegister {
		t.Error("AllowRegister should be false")
	}
	if !cfg.TrustedProxy {
		t.Error("TrustedProxy should be true")
	}
	if len(cfg.TrustedProxyCIDRs) != 2 {
		t.Fatalf("TrustedProxyCIDRs = %v, want two entries", cfg.TrustedProxyCIDRs)
	}
	if cfg.TrustedProxyCIDRs[0] != "10.0.0.0/8" || cfg.TrustedProxyCIDRs[1] != "192.168.1.1" {
		t.Errorf("TrustedProxyCIDRs = %v, want the trimmed entries in order", cfg.TrustedProxyCIDRs)
	}
	if len(cfg.TrustedOrigins) != 2 {
		t.Errorf("TrustedOrigins = %v, want two entries", cfg.TrustedOrigins)
	}
	if cfg.MaxUploadBytes != 10*1024*1024 {
		t.Errorf("MaxUploadBytes = %d", cfg.MaxUploadBytes)
	}
	if cfg.RateLimitPerMin != 42 {
		t.Errorf("RateLimitPerMin = %d", cfg.RateLimitPerMin)
	}
}

func TestLoadFallsBackWhenAValueIsUnparseable(t *testing.T) {
	t.Setenv("WJ_RATE_LIMIT_PER_MIN", "not a number")
	t.Setenv("WJ_SESSION_TTL", "not a duration")
	t.Setenv("WJ_COOKIE_SECURE", "maybe")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.RateLimitPerMin != 120 {
		t.Errorf("RateLimitPerMin = %d, want the default", cfg.RateLimitPerMin)
	}
	if cfg.SessionTTL != 7*24*time.Hour {
		t.Errorf("SessionTTL = %v, want the default", cfg.SessionTTL)
	}
	if cfg.CookieSecure {
		t.Error("CookieSecure should fall back to false")
	}
}

func TestAIConfigured(t *testing.T) {
	t.Setenv("WJ_AI_ENABLED", "true")
	t.Setenv("OPENAI_API_KEY", "")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.AIConfigured() {
		t.Error("AIConfigured should be false without a key")
	}

	t.Setenv("OPENAI_API_KEY", "   ")
	cfg, err = Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.AIConfigured() {
		t.Error("AIConfigured should be false for a blank key")
	}

	t.Setenv("OPENAI_API_KEY", "sk-test")
	cfg, err = Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !cfg.AIConfigured() {
		t.Error("AIConfigured should be true with a key")
	}

	t.Setenv("WJ_AI_ENABLED", "false")
	cfg, err = Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if cfg.AIConfigured() {
		t.Error("AIConfigured should be false when the feature is switched off")
	}
}
