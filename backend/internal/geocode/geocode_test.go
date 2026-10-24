package geocode

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNominatimReverseReadsASingleObject(t *testing.T) {
	// The service answers a reverse lookup with one object, not with a list.
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"display_name": "Sacred Heart Cathedral, Shishi, China",
			"name": "Sacred Heart Cathedral",
			"lat": "24.7999999",
			"lon": "118.6666666"
		}`))
	}))
	defer server.Close()

	provider := NewNominatim(server.URL, "test")
	place, err := provider.Reverse(context.Background(), 24.8, 118.6667)
	if err != nil {
		t.Fatalf("reverse failed: %v", err)
	}
	if place == nil {
		t.Fatal("the reverse lookup answered with nothing")
	}
	if place.Name != "Sacred Heart Cathedral" {
		t.Errorf("the name was %q", place.Name)
	}
	if diff(place.Latitude, 24.8) > 0.001 || diff(place.Longitude, 118.6667) > 0.001 {
		t.Errorf("the point was %f,%f", place.Latitude, place.Longitude)
	}
}

func TestNominatimSearchReadsAList(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[{
			"display_name": "Sacred Heart Cathedral, Shishi, China",
			"lat": "24.8",
			"lon": "118.6667"
		}]`))
	}))
	defer server.Close()

	provider := NewNominatim(server.URL, "test")
	places, err := provider.Search(context.Background(), "Sacred Heart", 8)
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(places) != 1 {
		t.Fatalf("the search answered with %d places", len(places))
	}
	if places[0].Name != "Sacred Heart Cathedral" {
		t.Errorf("the name was %q", places[0].Name)
	}
}

func TestAmapSearchConvertsToWgs(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v3/place/text" {
			t.Errorf("the search went to %s", r.URL.Path)
		}
		if r.URL.Query().Get("key") != "secret" {
			t.Errorf("the key was not sent")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"status": "1",
			"info": "OK",
			"pois": [{
				"name": "石狮天主教堂",
				"address": "宝盖镇",
				"location": "118.666666,24.799999"
			}]
		}`))
	}))
	defer server.Close()

	provider := NewAmap("secret", server.URL)
	places, err := provider.Search(context.Background(), "天主教堂", 8)
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(places) != 1 {
		t.Fatalf("the search answered with %d places", len(places))
	}
	if places[0].Name != "石狮天主教堂" {
		t.Errorf("the name was %q", places[0].Name)
	}
	// The service speaks GCJ-02, so the answer must be moved back. The
	// shift is a few hundred metres, which is a small difference in degrees.
	if diff(places[0].Latitude, 24.799999) > 0.01 || diff(places[0].Longitude, 118.666666) > 0.01 {
		t.Errorf("the point was not converted: %f,%f", places[0].Latitude, places[0].Longitude)
	}
	if places[0].Latitude == 24.799999 && places[0].Longitude == 118.666666 {
		t.Errorf("the point was not converted at all: %f,%f", places[0].Latitude, places[0].Longitude)
	}
}

func TestAmapReportsAFailedSearch(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"0","info":"INVALID_USER_KEY"}`))
	}))
	defer server.Close()

	provider := NewAmap("wrong", server.URL)
	if _, err := provider.Search(context.Background(), "anything", 8); err == nil {
		t.Fatal("a failed search was reported as a success")
	}
}
