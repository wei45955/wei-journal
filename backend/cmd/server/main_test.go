package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/wei/journal/backend/internal/config"
)

// clientIPFor issues a request with the given peer address and forwarding
// header and reports what Gin believes the client address to be.
func clientIPFor(t *testing.T, cfg *config.Config, peer, forwardedFor string) string {
	t.Helper()

	gin.SetMode(gin.TestMode)
	router := gin.New()
	if err := configureTrustedProxies(router, cfg); err != nil {
		t.Fatalf("configureTrustedProxies: %v", err)
	}
	router.GET("/", func(c *gin.Context) {
		c.String(http.StatusOK, c.ClientIP())
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.RemoteAddr = peer
	if forwardedFor != "" {
		req.Header.Set("X-Forwarded-For", forwardedFor)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec.Body.String()
}

func TestConfigureTrustedProxies(t *testing.T) {
	t.Run("no proxy trusts nobody", func(t *testing.T) {
		cfg := &config.Config{}
		got := clientIPFor(t, cfg, "203.0.113.9:1234", "198.51.100.7")
		if got != "203.0.113.9" {
			t.Fatalf("a forwarded header from an untrusted peer was believed: got %q", got)
		}
	})

	t.Run("a trusted proxy is believed", func(t *testing.T) {
		cfg := &config.Config{TrustedProxy: true}
		got := clientIPFor(t, cfg, "172.20.0.5:1234", "198.51.100.7")
		if got != "198.51.100.7" {
			t.Fatalf("the forwarding header of a trusted proxy was ignored: got %q", got)
		}
	})

	t.Run("an explicit list replaces the default one", func(t *testing.T) {
		cfg := &config.Config{TrustedProxy: true, TrustedProxyCIDRs: []string{"10.1.2.3/32"}}
		got := clientIPFor(t, cfg, "10.1.2.3:1234", "198.51.100.7")
		if got != "198.51.100.7" {
			t.Fatalf("the listed proxy was not trusted: got %q", got)
		}
		got = clientIPFor(t, cfg, "172.20.0.5:1234", "198.51.100.7")
		if got != "172.20.0.5" {
			t.Fatalf("a proxy outside the explicit list was trusted: got %q", got)
		}
	})
}

func TestEffectiveVersion(t *testing.T) {
	cases := []struct {
		stamped    string
		configured string
		want       string
	}{
		// A stamped release wins over whatever the environment says.
		{"1.2.3", "dev", "1.2.3"},
		{"1.2.3", "", "1.2.3"},
		// An unstamped binary falls back to the configured version.
		{"dev", "1.0.0", "1.0.0"},
		{"", "1.0.0", "1.0.0"},
		// A local run stays on the development version.
		{"dev", "dev", "dev"},
		{"dev", "", "dev"},
		{"", "", ""},
	}
	for _, c := range cases {
		if got := effectiveVersion(c.stamped, c.configured); got != c.want {
			t.Errorf("effectiveVersion(%q, %q) = %q, want %q", c.stamped, c.configured, got, c.want)
		}
	}
}
