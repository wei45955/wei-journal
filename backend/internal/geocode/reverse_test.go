package geocode

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAmapReverseKeepsThePointItWasGiven(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// The service answers with the address but without a place, which
		// is what happens when nothing stands at the point.
		_, _ = w.Write([]byte(`{
			"status": "1",
			"info": "OK",
			"regeocode": {"formatted_address": "somewhere"}
		}`))
	}))
	defer server.Close()

	provider := NewAmap("secret", "", server.URL)
	place, err := provider.Reverse(context.Background(), 24.799999, 118.666666)
	if err != nil {
		t.Fatalf("reverse failed: %v", err)
	}
	if place == nil {
		t.Fatal("the reverse lookup answered with nothing")
	}
	if place.Latitude == 0 && place.Longitude == 0 {
		t.Fatalf("the point was lost: %f,%f", place.Latitude, place.Longitude)
	}
	if diff(place.Latitude, 24.799999) > 0.0001 || diff(place.Longitude, 118.666666) > 0.0001 {
		t.Errorf("the point moved: %f,%f", place.Latitude, place.Longitude)
	}
}

func TestAmapReverseAsksInItsOwnSystem(t *testing.T) {
	var asked string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		asked = r.URL.Query().Get("location")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"1","info":"OK","regeocode":{"formatted_address":"somewhere"}}`))
	}))
	defer server.Close()

	provider := NewAmap("secret", "", server.URL)
	if _, err := provider.Reverse(context.Background(), 24.799999, 118.666666); err != nil {
		t.Fatalf("reverse failed: %v", err)
	}

	// The point has to be moved into the system the service reads, or the
	// answer describes a place a few hundred metres away.
	parts := strings.Split(asked, ",")
	if len(parts) != 2 {
		t.Fatalf("the point was sent as %q", asked)
	}
	var lon, lat float64
	if _, err := fmt.Sscan(parts[0], &lon); err != nil {
		t.Fatalf("the longitude was %q", parts[0])
	}
	if _, err := fmt.Sscan(parts[1], &lat); err != nil {
		t.Fatalf("the latitude was %q", parts[1])
	}
	if diff(lat, 24.799999) < 0.0001 {
		t.Errorf("the point was sent unchanged: %f,%f", lat, lon)
	}
}

func TestAmapReverseReadsAnEmptyAddressList(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		// The service sends an empty list where a text belongs.
		_, _ = w.Write([]byte(`{
			"status": "1",
			"info": "OK",
			"regeocode": {
				"formatted_address": "somewhere",
				"pois": [{"name": "a place", "address": [], "location": "118.6,24.8"}]
			}
		}`))
	}))
	defer server.Close()

	provider := NewAmap("secret", "", server.URL)
	place, err := provider.Reverse(context.Background(), 24.799999, 118.666666)
	if err != nil {
		t.Fatalf("reverse failed: %v", err)
	}
	if place == nil || place.Name != "a place" {
		t.Fatalf("the place was not read: %+v", place)
	}
}

func TestNominatimReverseSaysWhenItDoesNotKnow(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"error":"Unable to geocode"}`))
	}))
	defer server.Close()

	provider := NewNominatim(server.URL, "test")
	place, err := provider.Reverse(context.Background(), 24.8, 118.6667)
	if err != nil {
		t.Fatalf("reverse failed: %v", err)
	}
	if place != nil {
		t.Fatalf("an unknown point was given a name: %+v", place)
	}
}

// TestAmapSearchReadsAPoiWithoutAnAddress covers a place the service has no
// street address for, which it sends as an empty list. Reading that as a
// text fails the whole search.
func TestAmapSearchReadsAPoiWithoutAnAddress(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"status": "1",
			"info": "OK",
			"pois": [{"name": "a park", "address": [], "location": "118.6,24.8"}]
		}`))
	}))
	defer server.Close()

	provider := NewAmap("secret", "", server.URL)
	places, err := provider.Search(context.Background(), "a park", 5)
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(places) != 1 || places[0].Name != "a park" {
		t.Fatalf("the place was not read: %+v", places)
	}
}
