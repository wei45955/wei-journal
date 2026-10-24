package geocode

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Nominatim is the OpenStreetMap place service. It needs no key, so it is
// the default, but its coverage of Chinese place names is thin and its use
// policy asks for a low rate.
type Nominatim struct {
	BaseURL   string
	UserAgent string
	Client    *http.Client
}

// NewNominatim builds a client for a Nominatim instance.
func NewNominatim(baseURL, userAgent string) *Nominatim {
	return &Nominatim{
		BaseURL:   strings.TrimRight(baseURL, "/"),
		UserAgent: userAgent,
		Client:    &http.Client{Timeout: 10 * time.Second},
	}
}

// Name identifies the provider.
func (n *Nominatim) Name() string { return "nominatim" }

// Available reports whether the service can be used.
func (n *Nominatim) Available() bool { return n.BaseURL != "" }

// Search finds places whose name matches the query.
func (n *Nominatim) Search(ctx context.Context, query string, limit int) ([]Place, error) {
	if limit <= 0 {
		limit = 8
	}
	endpoint := fmt.Sprintf("%s/search?format=jsonv2&limit=%d&q=%s",
		n.BaseURL, limit, url.QueryEscape(query))
	body, err := n.get(ctx, endpoint)
	if err != nil {
		return nil, err
	}
	var raw []struct {
		DisplayName string `json:"display_name"`
		Lat         string `json:"lat"`
		Lon         string `json:"lon"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	places := make([]Place, 0, len(raw))
	for _, r := range raw {
		lat, lon, ok := parseCoordinate(r.Lat, r.Lon)
		if !ok {
			continue
		}
		places = append(places, Place{
			Name:      firstPart(r.DisplayName),
			Address:   r.DisplayName,
			Latitude:  lat,
			Longitude: lon,
		})
	}
	return places, nil
}

// Reverse names a point. Nominatim answers with a single object, not a list.
func (n *Nominatim) Reverse(ctx context.Context, lat, lon float64) (*Place, error) {
	endpoint := fmt.Sprintf("%s/reverse?format=jsonv2&lat=%f&lon=%f", n.BaseURL, lat, lon)
	body, err := n.get(ctx, endpoint)
	if err != nil {
		return nil, err
	}
	var raw struct {
		DisplayName string `json:"display_name"`
		Name        string `json:"name"`
		Lat         string `json:"lat"`
		Lon         string `json:"lon"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	name := raw.Name
	if name == "" {
		name = raw.DisplayName
	}
	parsedLat, parsedLon, ok := parseCoordinate(raw.Lat, raw.Lon)
	if !ok {
		parsedLat, parsedLon = lat, lon
	}
	return &Place{
		Name:      firstPart(name),
		Address:   raw.DisplayName,
		Latitude:  parsedLat,
		Longitude: parsedLon,
	}, nil
}

func (n *Nominatim) get(ctx context.Context, endpoint string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", n.UserAgent)
	resp, err := n.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("place search failed with status %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}

// parseCoordinate reads a pair of coordinates written as strings.
func parseCoordinate(lat, lon string) (float64, float64, bool) {
	parsedLat, err := strconv.ParseFloat(strings.TrimSpace(lat), 64)
	if err != nil {
		return 0, 0, false
	}
	parsedLon, err := strconv.ParseFloat(strings.TrimSpace(lon), 64)
	if err != nil {
		return 0, 0, false
	}
	if math.Abs(parsedLat) > 90 || math.Abs(parsedLon) > 180 {
		return 0, 0, false
	}
	return parsedLat, parsedLon, true
}

// firstPart takes the part of an address before the first comma, which is
// the name of the place rather than the street it stands on.
func firstPart(address string) string {
	trimmed := strings.TrimSpace(address)
	if idx := strings.Index(trimmed, ","); idx > 0 {
		return strings.TrimSpace(trimmed[:idx])
	}
	return trimmed
}
