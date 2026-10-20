package ai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// OpenAIConfig configures an OpenAI compatible chat completions endpoint.
type OpenAIConfig struct {
	APIKey      string
	BaseURL     string
	VisionModel string
	TextModel   string
	Timeout     time.Duration
	HTTPClient  *http.Client
}

// OpenAIProvider talks to any OpenAI compatible /chat/completions endpoint.
type OpenAIProvider struct {
	cfg OpenAIConfig
}

// NewOpenAIProvider builds a provider from configuration.
func NewOpenAIProvider(cfg OpenAIConfig) *OpenAIProvider {
	if cfg.Timeout <= 0 {
		cfg.Timeout = 90 * time.Second
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: cfg.Timeout}
	}
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	return &OpenAIProvider{cfg: cfg}
}

// Name identifies the provider.
func (p *OpenAIProvider) Name() string { return "openai-compatible" }

// Available reports whether credentials are present.
func (p *OpenAIProvider) Available() bool { return strings.TrimSpace(p.cfg.APIKey) != "" }

type chatMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type chatRequest struct {
	Model       string        `json:"model"`
	Messages    []chatMessage `json:"messages"`
	Temperature float64       `json:"temperature"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

func (p *OpenAIProvider) complete(ctx context.Context, model string, messages []chatMessage) (string, error) {
	if !p.Available() {
		return "", ErrNotConfigured
	}
	if model == "" {
		return "", fmt.Errorf("%w: no model configured", ErrNotConfigured)
	}
	body, err := json.Marshal(chatRequest{
		Model:       model,
		Messages:    messages,
		Temperature: 0.2,
		MaxTokens:   700,
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.cfg.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.cfg.APIKey)

	resp, err := p.cfg.HTTPClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("call model: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	var parsed chatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("decode model response (status %d): %w", resp.StatusCode, err)
	}
	if parsed.Error != nil {
		return "", fmt.Errorf("model error (status %d): %s", resp.StatusCode, parsed.Error.Message)
	}
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("model returned status %d", resp.StatusCode)
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("model returned no choices")
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
}

type contentPart struct {
	Type     string    `json:"type"`
	Text     string    `json:"text,omitempty"`
	ImageURL *imageURL `json:"image_url,omitempty"`
}

type imageURL struct {
	URL string `json:"url"`
}

// DescribeImage asks the vision model to describe a still image.
func (p *OpenAIProvider) DescribeImage(ctx context.Context, image []byte, mime string, opts DescribeOptions) (*ImageDescription, error) {
	language := opts.Language
	if language == "" {
		language = "English"
	}
	maxWords := opts.MaxWords
	if maxWords <= 0 {
		maxWords = 60
	}
	prompt := fmt.Sprintf(
		"You describe personal journal photographs. Describe what is actually visible in the image. "+
			"Never invent GPS coordinates, dates, names of people, or locations that are not visible. "+
			"Write the description in %s, in at most %d words. "+
			"Respond with a single JSON object and no other text, using the keys "+
			"\"description\", \"subjects\", \"activities\", \"scene\", \"keywords\", \"suggestedTags\". "+
			"subjects, activities, keywords and suggestedTags are arrays of short strings.",
		language, maxWords,
	)
	dataURL := "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(image)
	content := []contentPart{
		{Type: "text", Text: prompt},
		{Type: "image_url", ImageURL: &imageURL{URL: dataURL}},
	}
	raw, err := p.complete(ctx, p.cfg.VisionModel, []chatMessage{{Role: "user", Content: content}})
	if err != nil {
		return nil, err
	}
	desc := &ImageDescription{}
	if err := decodeJSONObject(raw, desc); err != nil {
		// The model answered in prose; keep it as the description.
		desc.Description = raw
	}
	desc.SuggestedTags = sanitizeList(desc.SuggestedTags)
	desc.Keywords = sanitizeList(desc.Keywords)
	desc.Subjects = sanitizeList(desc.Subjects)
	desc.Activities = sanitizeList(desc.Activities)
	return desc, nil
}

// SummarizeText asks the model to summarise written journal content.
func (p *OpenAIProvider) SummarizeText(ctx context.Context, text string, opts SummarizeOptions) (*TextSummary, error) {
	language := opts.Language
	if language == "" {
		language = "English"
	}
	maxWords := opts.MaxWords
	if maxWords <= 0 {
		maxWords = 80
	}
	trimmed := text
	if len(trimmed) > 12000 {
		trimmed = trimmed[:12000]
	}
	prompt := fmt.Sprintf(
		"You summarise personal journal entries. Keep the writer's own voice and facts. "+
			"Do not add information that is not in the text. "+
			"Write the summary in %s, in at most %d words. "+
			"Respond with a single JSON object and no other text, using the keys "+
			"\"summary\", \"keywords\", \"suggestedTags\". "+
			"keywords and suggestedTags are arrays of short strings.",
		language, maxWords,
	)
	raw, err := p.complete(ctx, p.cfg.TextModel, []chatMessage{
		{Role: "system", Content: "You are a careful assistant that summarises personal notes."},
		{Role: "user", Content: prompt + "\n\n---\n" + trimmed},
	})
	if err != nil {
		return nil, err
	}
	summary := &TextSummary{}
	if err := decodeJSONObject(raw, summary); err != nil {
		summary.Summary = raw
	}
	summary.Keywords = sanitizeList(summary.Keywords)
	summary.SuggestedTags = sanitizeList(summary.SuggestedTags)
	return summary, nil
}

// decodeJSONObject extracts a JSON object from a model response that may be
// wrapped in a markdown code fence.
func decodeJSONObject(raw string, target any) error {
	text := strings.TrimSpace(raw)
	if idx := strings.Index(text, "{"); idx >= 0 {
		end := strings.LastIndex(text, "}")
		if end > idx {
			text = text[idx : end+1]
		}
	}
	return json.Unmarshal([]byte(text), target)
}

func sanitizeList(items []string) []string {
	out := make([]string, 0, len(items))
	seen := map[string]bool{}
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" || len(item) > 60 {
			continue
		}
		key := strings.ToLower(item)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, item)
		if len(out) >= 12 {
			break
		}
	}
	return out
}
