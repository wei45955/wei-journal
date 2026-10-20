// Package journal holds the domain logic shared by the HTTP API and the
// background workers: text extraction, word counting and index building.
package journal

import (
	"encoding/json"
	"strings"
	"unicode"

	"github.com/wei/journal/backend/internal/search"
)

// Node is a generic editor document node. The editor stores a Tiptap
// compatible JSON document; only the parts the server needs to understand
// are interpreted here.
type Node struct {
	Type    string         `json:"type"`
	Attrs   map[string]any `json:"attrs,omitempty"`
	Text    string         `json:"text,omitempty"`
	Marks   []Mark         `json:"marks,omitempty"`
	Content []Node         `json:"content,omitempty"`
}

// Mark is an inline formatting mark.
type Mark struct {
	Type  string         `json:"type"`
	Attrs map[string]any `json:"attrs,omitempty"`
}

// Document is the root of an editor document.
type Document struct {
	Type    string `json:"type"`
	Content []Node `json:"content,omitempty"`
}

// ParseDocument decodes an editor document, returning an empty document when
// the payload is unusable so a corrupt value never breaks a save.
func ParseDocument(raw string) Document {
	if strings.TrimSpace(raw) == "" {
		return Document{Type: "doc"}
	}
	var doc Document
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		return Document{Type: "doc"}
	}
	return doc
}

// EncodeDocument serialises an editor document.
func EncodeDocument(doc Document) string {
	b, err := json.Marshal(doc)
	if err != nil {
		return ""
	}
	return string(b)
}

// ExtractText flattens an editor document into plain readable text. Media
// nodes contribute their alt text and label so they remain searchable.
func ExtractText(doc Document) string {
	var b strings.Builder
	walk(doc.Content, &b)
	return strings.TrimSpace(collapseSpace(b.String()))
}

func walk(nodes []Node, b *strings.Builder) {
	for _, n := range nodes {
		switch n.Type {
		case "text":
			b.WriteString(n.Text)
		case "hardBreak":
			b.WriteString(" ")
		case "image", "livePhoto", "video", "audio":
			if alt, ok := n.Attrs["alt"].(string); ok && alt != "" {
				b.WriteString(alt)
				b.WriteString(" ")
			}
			if label, ok := n.Attrs["label"].(string); ok && label != "" {
				b.WriteString(label)
				b.WriteString(" ")
			}
		case "file":
			if name, ok := n.Attrs["filename"].(string); ok && name != "" {
				b.WriteString(name)
				b.WriteString(" ")
			}
		case "location":
			if name, ok := n.Attrs["name"].(string); ok && name != "" {
				b.WriteString(name)
				b.WriteString(" ")
			}
		case "drawing":
			if name, ok := n.Attrs["name"].(string); ok && name != "" {
				b.WriteString(name)
				b.WriteString(" ")
			}
		}
		if len(n.Content) > 0 {
			walk(n.Content, b)
		}
		switch n.Type {
		case "paragraph", "heading", "listItem", "blockquote", "codeBlock", "tableCell", "tableHeader":
			b.WriteString("\n")
		}
	}
}

// CountWords counts words the way a reader would: every CJK character counts
// as one word and every run of latin letters or digits counts as one word.
// Punctuation, whitespace and editor markup are ignored.
func CountWords(text string) int {
	count := 0
	inWord := false
	for _, r := range text {
		switch {
		case unicode.Is(unicode.Han, r), unicode.Is(unicode.Hiragana, r),
			unicode.Is(unicode.Katakana, r), unicode.Is(unicode.Hangul, r):
			count++
			inWord = false
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			if !inWord {
				count++
				inWord = true
			}
		default:
			inWord = false
		}
	}
	return count
}

func collapseSpace(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// DrawingsFromDocument collects the vector drawings embedded in a document so
// they can be stored separately and re-opened for editing.
func DrawingsFromDocument(doc Document) []json.RawMessage {
	var out []json.RawMessage
	var walkNodes func(nodes []Node)
	walkNodes = func(nodes []Node) {
		for _, n := range nodes {
			if n.Type == "drawing" {
				if raw, err := json.Marshal(n.Attrs["drawing"]); err == nil && len(raw) > 2 {
					out = append(out, raw)
				}
			}
			walkNodes(n.Content)
		}
	}
	walkNodes(doc.Content)
	return out
}

// BuildDocs assembles the searchable documents for an entry from every source
// that contributes text.
type BuildDocsInput struct {
	Title       string
	PlainText   string
	TagNames    []string
	FolderName  string
	Location    string
	MediaNames  []string
	AIKeywords  []string
	AIText      []string
	AIImageDesc []MediaDescription
}

// MediaDescription pairs a media asset with its AI generated description.
type MediaDescription struct {
	MediaID     uint
	Filename    string
	Location    string
	Description string
}

// BuildDocs converts the input into index documents.
func BuildDocs(in BuildDocsInput) []search.Doc {
	var docs []search.Doc
	if v := strings.TrimSpace(in.Title); v != "" {
		docs = append(docs, search.Doc{Kind: search.KindTitle, Field: "title", Text: v})
	}
	if v := strings.TrimSpace(in.PlainText); v != "" {
		docs = append(docs, search.Doc{Kind: search.KindText, Field: "text", Text: v})
	}
	for _, t := range in.TagNames {
		if v := strings.TrimSpace(t); v != "" {
			docs = append(docs, search.Doc{Kind: search.KindTag, Field: "tag", Text: v})
		}
	}
	if v := strings.TrimSpace(in.FolderName); v != "" {
		docs = append(docs, search.Doc{Kind: search.KindFolder, Field: "folder", Text: v})
	}
	if v := strings.TrimSpace(in.Location); v != "" {
		docs = append(docs, search.Doc{Kind: search.KindLocation, Field: "location", Text: v})
	}
	for _, m := range in.MediaNames {
		if v := strings.TrimSpace(m); v != "" {
			docs = append(docs, search.Doc{Kind: search.KindMedia, Field: "filename", Text: v})
		}
	}
	for _, k := range in.AIKeywords {
		if v := strings.TrimSpace(k); v != "" {
			docs = append(docs, search.Doc{Kind: search.KindAIText, Field: "keywords", Text: v})
		}
	}
	for _, t := range in.AIText {
		if v := strings.TrimSpace(t); v != "" {
			docs = append(docs, search.Doc{Kind: search.KindAIText, Field: "summary", Text: v})
		}
	}
	for _, m := range in.AIImageDesc {
		if v := strings.TrimSpace(m.Description); v != "" {
			id := m.MediaID
			docs = append(docs, search.Doc{
				Kind: search.KindAIImage, Field: "imageDescription", Text: v, MediaID: &id,
			})
		}
	}
	return docs
}
