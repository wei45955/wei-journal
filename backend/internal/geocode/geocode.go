// Package geocode wraps the external place search that turns a name into a
// point on the map. The provider is an interface so the concrete service can
// be swapped through configuration alone.
//
// Two services are supported. Nominatim, the OpenStreetMap service, needs no
// key but covers the world unevenly and has a strict use policy. Amap, the
// Chinese service, needs a key and is far better at Chinese place names.
//
// The two do not agree on coordinates: Nominatim speaks WGS-84, Amap speaks
// GCJ-02, the Chinese offset system. Everything stored in the journal is
// WGS-84, because that is what a photograph carries and what the map draws,
// so the results of Amap are converted on the way in.
package geocode

import (
	"context"
	"errors"
)

// ErrNotConfigured is returned when no provider credentials are available.
var ErrNotConfigured = errors.New("geocoding provider is not configured")

// Place is one suggestion from a place search.
type Place struct {
	// Name is the short name of the place.
	Name string
	// Address is the longer description of where it is.
	Address string
	// Latitude and Longitude are in WGS-84, whatever the provider speaks.
	Latitude  float64
	Longitude float64
}

// Geocoder is the contract every place service implements.
type Geocoder interface {
	// Name identifies the provider in diagnostics.
	Name() string
	// Available reports whether the provider is usable right now.
	Available() bool
	// Search finds places whose name matches the query.
	Search(ctx context.Context, query string, limit int) ([]Place, error)
	// Reverse names a point.
	Reverse(ctx context.Context, lat, lon float64) (*Place, error)
}
