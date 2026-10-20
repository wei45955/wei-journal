// Package ai wraps the external language model used to enrich the journal
// with image descriptions and text summaries. The provider is an interface so
// the concrete endpoint can be swapped through configuration alone.
package ai

import (
	"context"
	"errors"
)

// ErrNotConfigured is returned when no provider credentials are available.
var ErrNotConfigured = errors.New("ai provider is not configured")

// ImageDescription is the result of describing a single image.
type ImageDescription struct {
	Description   string   `json:"description"`
	Subjects      []string `json:"subjects"`
	Activities    []string `json:"activities"`
	Scene         string   `json:"scene"`
	Keywords      []string `json:"keywords"`
	SuggestedTags []string `json:"suggestedTags"`
}

// TextSummary is the result of summarising the written content of an entry.
type TextSummary struct {
	Summary       string   `json:"summary"`
	Keywords      []string `json:"keywords"`
	SuggestedTags []string `json:"suggestedTags"`
}

// Provider is the contract every model backend implements. Image
// understanding and text summarisation are separate so a deployment can
// point them at different models.
type Provider interface {
	// Name identifies the provider in diagnostics.
	Name() string
	// Available reports whether the provider is usable right now.
	Available() bool
	// DescribeImage produces a description for one still image.
	DescribeImage(ctx context.Context, image []byte, mime string, opts DescribeOptions) (*ImageDescription, error)
	// SummarizeText summarises the written content of an entry.
	SummarizeText(ctx context.Context, text string, opts SummarizeOptions) (*TextSummary, error)
}

// DescribeOptions tunes image description.
type DescribeOptions struct {
	Language string
	MaxWords int
}

// SummarizeOptions tunes text summarisation.
type SummarizeOptions struct {
	Language string
	MaxWords int
}
