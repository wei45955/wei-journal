package geocode

import "context"

// Disabled stands in when no place service is configured. The journal works
// without one: places can still be set by hand and photographs still carry
// their own coordinates. Only the search by name is missing.
type Disabled struct{}

// NewDisabled builds the provider used when nothing is configured.
func NewDisabled() *Disabled { return &Disabled{} }

// Name identifies the provider.
func (d *Disabled) Name() string { return "disabled" }

// Available reports whether the service can be used.
func (d *Disabled) Available() bool { return false }

// Search finds places whose name matches the query.
func (d *Disabled) Search(ctx context.Context, query string, limit int) ([]Place, error) {
	return nil, ErrNotConfigured
}

// Reverse names a point.
func (d *Disabled) Reverse(ctx context.Context, lat, lon float64) (*Place, error) {
	return nil, ErrNotConfigured
}
