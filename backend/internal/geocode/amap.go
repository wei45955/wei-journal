package geocode

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// Amap is the Chinese place service. It needs a key, and it is much better
// than the OpenStreetMap one at Chinese place names, which is what makes it
// worth having. It answers in GCJ-02, so the coordinates are converted back
// to WGS-84 before they leave this package.
type Amap struct {
	Key      string
	BaseURL  string
	Client   *http.Client
	CityCode string
}

// NewAmap builds a client for the Amap web service.
func NewAmap(key, baseURL string) *Amap {
	if baseURL == "" {
		baseURL = "https://restapi.amap.com"
	}
	return &Amap{
		Key:     strings.TrimSpace(key),
		BaseURL: strings.TrimRight(baseURL, "/"),
		Client:  &http.Client{Timeout: 10 * time.Second},
	}
}

// Name identifies the provider.
func (a *Amap) Name() string { return "amap" }

// Available reports whether the service can be used.
func (a *Amap) Available() bool { return a.Key != "" }

// Search finds places whose name matches the query.
func (a *Amap) Search(ctx context.Context, query string, limit int) ([]Place, error) {
	if limit <= 0 {
		limit = 8
	}
	params := url.Values{}
	params.Set("key", a.Key)
	params.Set("keywords", query)
	params.Set("extensions", "base")
	params.Set("offset", strconv.Itoa(limit))
	if a.CityCode != "" {
		params.Set("city", a.CityCode)
		params.Set("citylimit", "true")
	}

	body, err := a.get(ctx, "/v3/place/text", params)
	if err != nil {
		return nil, err
	}
	var raw struct {
		Status string `json:"status"`
		Info   string `json:"info"`
		Pois   []struct {
			Name     string      `json:"name"`
			Address  looseString `json:"address"`
			Location string      `json:"location"`
		} `json:"pois"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	if raw.Status != "1" {
		return nil, fmt.Errorf("place search failed: %s", raw.Info)
	}
	places := make([]Place, 0, len(raw.Pois))
	for _, poi := range raw.Pois {
		lat, lon, ok := parseAmapLocation(poi.Location)
		if !ok {
			continue
		}
		places = append(places, Place{
			Name:      strings.TrimSpace(poi.Name),
			Address:   poi.Address.String(),
			Latitude:  lat,
			Longitude: lon,
		})
	}
	return places, nil
}

// Reverse names a point. The point arrives in WGS-84, the system the
// journal keeps, and the service reads its own system, so it is moved on the
// way there. The answer only names the place: the point that was asked
// about is the one that is kept.
func (a *Amap) Reverse(ctx context.Context, lat, lon float64) (*Place, error) {
	params := url.Values{}
	params.Set("key", a.Key)
	// The service reads the point in its own system.
	gcjLat, gcjLon := wgsToGcj(lat, lon)
	params.Set("location", fmt.Sprintf("%f,%f", gcjLon, gcjLat))
	// The points of interest carry the name of the place; without them the
	// answer is only an address.
	params.Set("extensions", "all")

	body, err := a.get(ctx, "/v3/geocode/regeo", params)
	if err != nil {
		return nil, err
	}
	var raw struct {
		Status    string `json:"status"`
		Info      string `json:"info"`
		Regeocode struct {
			FormattedAddress looseString `json:"formatted_address"`
			POIs             []struct {
				Name    string      `json:"name"`
				Address looseString `json:"address"`
			} `json:"pois"`
		} `json:"regeocode"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, err
	}
	if raw.Status != "1" {
		return nil, fmt.Errorf("place search failed: %s", raw.Info)
	}
	// The answer keeps the point it was given, which is already in the
	// system the journal keeps. A place of its own only names it: the
	// position asked for is the position of the writer, and the place
	// nearby may be a few hundred metres away.
	place := &Place{
		Name:      raw.Regeocode.FormattedAddress.String(),
		Address:   raw.Regeocode.FormattedAddress.String(),
		Latitude:  lat,
		Longitude: lon,
	}
	if len(raw.Regeocode.POIs) > 0 {
		place.Name = strings.TrimSpace(raw.Regeocode.POIs[0].Name)
		if address := raw.Regeocode.POIs[0].Address.String(); address != "" {
			place.Address = address
		}
	}
	return place, nil
}

// looseString reads a string that the service sometimes sends as an empty
// list instead of an empty text.
type looseString string

// UnmarshalJSON accepts both a string and a list.
func (s *looseString) UnmarshalJSON(data []byte) error {
	var text string
	if err := json.Unmarshal(data, &text); err == nil {
		*s = looseString(text)
		return nil
	}
	var list []any
	if err := json.Unmarshal(data, &list); err == nil {
		*s = ""
		return nil
	}
	return fmt.Errorf("the place service sent an address that is neither a text nor a list")
}

// String gives the text back.
func (s looseString) String() string { return strings.TrimSpace(string(s)) }

func (a *Amap) get(ctx context.Context, path string, params url.Values) ([]byte, error) {
	endpoint := a.BaseURL + path + "?" + params.Encode()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := a.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("place search failed with status %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, 1<<20))
}

// parseAmapLocation reads a coordinate pair written as "longitude,latitude"
// and converts it from GCJ-02 to WGS-84.
func parseAmapLocation(value string) (float64, float64, bool) {
	parts := strings.Split(strings.TrimSpace(value), ",")
	if len(parts) != 2 {
		return 0, 0, false
	}
	lon, err := strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
	if err != nil {
		return 0, 0, false
	}
	lat, err := strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
	if err != nil {
		return 0, 0, false
	}
	lat, lon = gcjToWgs(lat, lon)
	return lat, lon, true
}
