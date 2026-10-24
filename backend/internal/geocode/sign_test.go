package geocode

import (
	"context"
	"crypto/md5"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sort"
	"strings"
	"testing"
)

// TestAmapSignsItsRequest covers the accounts that have the digital
// signature switched on: without the signature such an account is refused.
func TestAmapSignsItsRequest(t *testing.T) {
	var asked url.Values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = r.URL.Query()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"1","info":"OK","pois":[]}`))
	}))
	defer server.Close()

	provider := NewAmap("my-key", "my-secret", server.URL)
	if _, err := provider.Search(context.Background(), "a park", 5); err != nil {
		t.Fatalf("search failed: %v", err)
	}

	sig := asked.Get("sig")
	if sig == "" {
		t.Fatal("the request carried no signature")
	}

	// The signature is the parameters in the order of their names, with the
	// secret behind them, hashed. Recomputed here from what was actually
	// sent, so a wrong order or a missing parameter is caught.
	names := make([]string, 0, len(asked))
	for name := range asked {
		if name == "sig" {
			continue
		}
		names = append(names, name)
	}
	sort.Strings(names)
	parts := make([]string, 0, len(names))
	for _, name := range names {
		parts = append(parts, name+"="+asked.Get(name))
	}
	sum := md5.Sum([]byte(strings.Join(parts, "&") + "my-secret"))
	if want := hex.EncodeToString(sum[:]); sig != want {
		t.Errorf("the signature was %q, want %q", sig, want)
	}
}

// TestAmapWithoutASecretSendsNoSignature keeps a key with no signature
// switched on working: such a key must not be sent a sig it does not expect.
func TestAmapWithoutASecretSendsNoSignature(t *testing.T) {
	var asked url.Values
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = r.URL.Query()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"1","info":"OK","pois":[]}`))
	}))
	defer server.Close()

	provider := NewAmap("my-key", "", server.URL)
	if _, err := provider.Search(context.Background(), "a park", 5); err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if sig := asked.Get("sig"); sig != "" {
		t.Errorf("a signature was sent without a secret: %q", sig)
	}
}
