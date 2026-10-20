// Package search maintains the full text index over the journal and answers
// queries against it.
//
// Indexing strategy
//
//	FTS5's default unicode tokenizer treats a whole run of Chinese characters
//	as a single token, so "天气" would never match "今天天气很好". The
//	index therefore keeps three complementary tables over one canonical
//	document table:
//
//	  - search_fts   trigram tokenizer   substring search, 3+ characters
//	  - search_cjk   unicode61 tokenizer unigram/bigram CJK tokens, 1-2 chars
//	  - search_words unicode61 tokenizer latin word and prefix search
//
//	CJK text is expanded into overlapping 1 and 2 character tokens before it
//	is indexed, which restores substring semantics for Chinese without
//	loading the archive into memory.
package search

import (
	"strings"
	"unicode"
)

// IsCJK reports whether the rune belongs to a CJK script.
func IsCJK(r rune) bool {
	return unicode.Is(unicode.Han, r) ||
		unicode.Is(unicode.Hiragana, r) ||
		unicode.Is(unicode.Katakana, r) ||
		unicode.Is(unicode.Hangul, r)
}

// ContainsCJK reports whether the string contains any CJK rune.
func ContainsCJK(s string) bool {
	for _, r := range s {
		if IsCJK(r) {
			return true
		}
	}
	return false
}

// ExpandCJK turns a string into a whitespace separated list of overlapping
// one and two character CJK tokens. Latin characters are dropped because they
// are served by the trigram and word tables.
func ExpandCJK(s string) string {
	runes := []rune(s)
	tokens := make([]string, 0, len(runes))
	for i := 0; i < len(runes); i++ {
		if !IsCJK(runes[i]) {
			continue
		}
		tokens = append(tokens, string(runes[i]))
		if i+1 < len(runes) && IsCJK(runes[i+1]) {
			tokens = append(tokens, string(runes[i:i+2]))
		}
	}
	return strings.Join(tokens, " ")
}

// CJKQueryTokens returns the query expansion used to look up a CJK query.
func CJKQueryTokens(s string) []string {
	expanded := ExpandCJK(s)
	if expanded == "" {
		return nil
	}
	return strings.Fields(expanded)
}

// Normalize lowercases and trims a raw query.
func Normalize(q string) string {
	return strings.ToLower(strings.TrimSpace(q))
}
