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

func (p *OpenAIProvider) complete(ctx context.Context, model string, messages []chatMessage, maxTokens int) (string, error) {
	if !p.Available() {
		return "", ErrNotConfigured
	}
	if model == "" {
		return "", fmt.Errorf("%w: no model configured", ErrNotConfigured)
	}
	if maxTokens <= 0 {
		maxTokens = 700
	}
	body, err := json.Marshal(chatRequest{
		Model:       model,
		Messages:    messages,
		Temperature: 0.2,
		MaxTokens:   maxTokens,
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
	raw, err := p.complete(ctx, p.cfg.VisionModel, []chatMessage{{Role: "user", Content: content}}, 700)
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
	}, 700)
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

// The instruction used when the writer did not say what they wanted.
const defaultPolishInstruction = "润色这段文字：语句更通顺，节奏更好，保留原来的意思、事实和语气，去掉多余的话。"

// PolishText rewrites a draft the way the writer asked. The answer is the
// rewritten text and nothing else, so it can be read back into the entry.
func (p *OpenAIProvider) PolishText(ctx context.Context, text string, opts PolishOptions) (string, error) {
	instruction := strings.TrimSpace(opts.Instruction)
	if instruction == "" {
		instruction = defaultPolishInstruction
	}
	trimmed := text
	if len([]rune(trimmed)) > 12000 {
		trimmed = string([]rune(trimmed)[:12000])
	}
	if strings.TrimSpace(trimmed) == "" {
		return "", fmt.Errorf("there is no text to rewrite")
	}
	system := "You rewrite personal journal entries in the writer's own voice and in the language they wrote in. " +
		"Follow the instruction exactly. " +
		"Keep the facts, the names, the details and the feeling of the original; never invent anything that is not there. " +
		"Answer with the rewritten text only: no preamble, no label, no quotation marks, no notes and no explanation."
	raw, err := p.complete(ctx, p.cfg.TextModel, []chatMessage{
		{Role: "system", Content: system},
		{Role: "user", Content: instruction + "\n\n---\n" + trimmed},
	}, 2000)
	if err != nil {
		return "", err
	}
	polished := trimModelText(raw)
	if polished == "" {
		return "", fmt.Errorf("the model returned no text")
	}
	return polished, nil
}

// trimModelText removes the wrappers a model sometimes puts around its
// answer: a code fence, a leading label, or the marks around the whole thing.
func trimModelText(raw string) string {
	text := strings.TrimSpace(raw)
	if strings.HasPrefix(text, "```") {
		if idx := strings.Index(text, "\n"); idx >= 0 {
			text = text[idx+1:]
		}
		if idx := strings.LastIndex(text, "```"); idx > 0 {
			text = text[:idx]
		}
		text = strings.TrimSpace(text)
	}
	// A leading label is not part of the entry.
	for _, label := range []string{
		"润色后：", "润色后:", "改写后：", "改写后:", "修改后：", "修改后:",
		"润色结果：", "润色结果:", "以下是润色后的内容：", "以下是润色后的内容:",
		"Rewritten:", "Polished:", "Result:",
	} {
		if strings.HasPrefix(text, label) {
			text = strings.TrimSpace(strings.TrimPrefix(text, label))
			break
		}
	}
	// The whole answer in quotation marks.
	runes := []rune(text)
	if len(runes) > 1 {
		first, last := runes[0], runes[len(runes)-1]
		if (first == '"' && last == '"') || (first == '“' && last == '”') ||
			(first == '「' && last == '」') || (first == '‘' && last == '’') {
			text = strings.TrimSpace(string(runes[1 : len(runes)-1]))
		}
	}
	return text
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
