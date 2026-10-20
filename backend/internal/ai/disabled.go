package ai

import "context"

// disabledProvider stands in when no model backend is configured. Every call
// fails with ErrNotConfigured, which the workers translate into an
// "unavailable" state instead of a hard failure.
type disabledProvider struct{}

// NewDisabledProvider returns a provider that never produces results.
func NewDisabledProvider() Provider { return disabledProvider{} }

func (disabledProvider) Name() string    { return "disabled" }
func (disabledProvider) Available() bool { return false }

func (disabledProvider) DescribeImage(ctx context.Context, image []byte, mime string, opts DescribeOptions) (*ImageDescription, error) {
	return nil, ErrNotConfigured
}

func (disabledProvider) SummarizeText(ctx context.Context, text string, opts SummarizeOptions) (*TextSummary, error) {
	return nil, ErrNotConfigured
}
