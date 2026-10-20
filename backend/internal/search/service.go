package search

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode"

	"gorm.io/gorm"
)

// Document kinds stored in the index.
const (
	KindTitle    = "title"
	KindText     = "text"
	KindTag      = "tag"
	KindFolder   = "folder"
	KindAIText   = "ai_text"
	KindAIImage  = "ai_image"
	KindMedia    = "media"
	KindLocation = "location"
)

// Doc is one indexed unit of searchable text.
type Doc struct {
	Kind    string
	Field   string
	Text    string
	MediaID *uint
}

// Result is a single index hit.
type Result struct {
	EntryID uint
	MediaID *uint
	Kind    string
	Field   string
	Score   float64
	Snippet string
}

// Service reads and writes the search index.
type Service struct {
	db      *gorm.DB
	dialect string
}

// NewService builds a search service for the given dialect.
func NewService(db *gorm.DB, dialect string) *Service {
	return &Service{db: db, dialect: dialect}
}

// ReplaceEntryDocs atomically swaps the indexed documents of an entry.
func (s *Service) ReplaceEntryDocs(userID, entryID uint, docs []Doc) error {
	return s.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec(
			"DELETE FROM search_docs WHERE entry_id = ? AND user_id = ?", entryID, userID,
		).Error; err != nil {
			return err
		}
		if len(docs) == 0 {
			return nil
		}
		now := time.Now().UTC()
		rows := make([]map[string]any, 0, len(docs))
		for _, d := range docs {
			text := strings.TrimSpace(d.Text)
			if text == "" {
				continue
			}
			rows = append(rows, map[string]any{
				"user_id":    userID,
				"entry_id":   entryID,
				"media_id":   nullableID(d.MediaID),
				"kind":       d.Kind,
				"field":      d.Field,
				"text":       text,
				"cjk_text":   ExpandCJK(text),
				"created_at": now,
			})
		}
		if len(rows) == 0 {
			return nil
		}
		return tx.Table("search_docs").CreateInBatches(rows, 50).Error
	})
}

// RemoveEntryDocs drops every indexed document belonging to an entry.
func (s *Service) RemoveEntryDocs(userID, entryID uint) error {
	return s.db.Exec("DELETE FROM search_docs WHERE entry_id = ? AND user_id = ?", entryID, userID).Error
}

// RemoveUserDocs drops every indexed document of a user, used on account
// deletion.
func (s *Service) RemoveUserDocs(userID uint) error {
	return s.db.Exec("DELETE FROM search_docs WHERE user_id = ?", userID).Error
}

func nullableID(id *uint) any {
	if id == nil {
		return nil
	}
	return *id
}

// Filter narrows a search to a subset of the archive.
type Filter struct {
	FolderID   *uint
	TagIDs     []uint
	From       *time.Time
	To         *time.Time
	MediaKind  string
	Unfoldered bool
}

// QueryOptions carries everything a search request needs.
type QueryOptions struct {
	Query  string
	Filter Filter
	Limit  int
	Offset int
}

// Search runs a query and returns the matching index hits.
func (s *Service) Search(userID uint, opts QueryOptions) ([]Result, error) {
	q := Normalize(opts.Query)
	if q == "" {
		return nil, nil
	}
	limit := opts.Limit
	if limit <= 0 || limit > 500 {
		limit = 50
	}
	offset := opts.Offset
	if offset < 0 {
		offset = 0
	}

	var results []Result
	var err error
	if s.dialect == "postgres" {
		results, err = s.searchPostgres(userID, q, limit*4, offset)
	} else {
		results, err = s.searchSQLite(userID, q, limit*4, offset)
	}
	if err != nil {
		return nil, err
	}
	return results, nil
}

// ftsQuery pairs an FTS5 table with the expression evaluated against it.
type ftsQuery struct {
	table string
	match string
}

// searchSQLite queries the FTS5 tables and returns the raw hits.
func (s *Service) searchSQLite(userID uint, q string, limit, offset int) ([]Result, error) {
	var queries []ftsQuery
	switch {
	case ContainsCJK(q):
		tokens := CJKQueryTokens(q)
		if len(tokens) == 0 {
			return nil, nil
		}
		// CJK text is indexed as unigram/bigram tokens, so the query is
		// expanded the same way and matched with AND semantics.
		queries = append(queries, ftsQuery{"search_cjk", buildCJKQuery(tokens)})
	case runeLen(q) >= 3:
		// Substring match over the trigram index plus a word level prefix
		// match; the word hits are ranked higher.
		queries = append(queries,
			ftsQuery{"search_fts", quotePhrase(q)},
			ftsQuery{"search_words", quotePhrase(q)},
		)
		if prefix := sanitizePrefix(q); prefix != "" {
			queries = append(queries, ftsQuery{"search_words", prefix + "*"})
		}
	default:
		if prefix := sanitizePrefix(q); prefix != "" {
			queries = append(queries, ftsQuery{"search_words", prefix + "*"})
		}
	}

	seen := map[uint]bool{}
	results := make([]Result, 0, limit)
	// The offset is applied to the merged result set, not to each index on
	// its own. Applying it to every index separately would make the second
	// page repeat the hits of the first one.
	fetch := limit + offset
	for _, fq := range queries {
		rows, err := s.queryFTSTable(fq.table, fq.match, userID, fetch, 0, q)
		if err != nil {
			return nil, err
		}
		results = appendUnique(results, seen, rows)
		if len(results) >= fetch {
			break
		}
	}
	if offset > 0 {
		if offset >= len(results) {
			return nil, nil
		}
		results = results[offset:]
	}
	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

func (s *Service) queryFTSTable(table, match string, userID uint, limit, offset int, q string) ([]Result, error) {
	query := fmt.Sprintf(`
		SELECT d.entry_id, d.media_id, d.kind, d.field, d.text,
		       bm25(%s) AS score
		FROM %s
		JOIN search_docs d ON d.id = %s.rowid
		WHERE %s MATCH ? AND d.user_id = ?
		ORDER BY score
		LIMIT ? OFFSET ?`, table, table, table, table)

	rows, err := s.db.Raw(query, match, userID, limit, offset).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Result, 0, limit)
	for rows.Next() {
		var (
			entryID uint
			mediaID sql.NullInt64
			kind    string
			field   string
			text    string
			score   float64
		)
		if err := rows.Scan(&entryID, &mediaID, &kind, &field, &text, &score); err != nil {
			return nil, err
		}
		res := Result{EntryID: entryID, Kind: kind, Field: field, Score: -score, Snippet: snippet(text, q)}
		if mediaID.Valid {
			id := uint(mediaID.Int64)
			res.MediaID = &id
		}
		out = append(out, res)
	}
	return out, rows.Err()
}

// searchPostgres mirrors the SQLite strategy using pg_trgm and tsvector.
func (s *Service) searchPostgres(userID uint, q string, limit, offset int) ([]Result, error) {
	// The tsquery is built from the term and passed in as a parameter, so it
	// has to be a valid tsquery expression and nothing else.
	match := postgresTsQuery(q)
	if ContainsCJK(q) && match == "" {
		return nil, nil
	}

	// The wildcard characters of the term are escaped so that a search for
	// "50%" looks for that text and not for anything that starts with "50".
	pattern := "%" + escapeLike(q) + "%"

	query := `
		SELECT d.entry_id, d.media_id, d.kind, d.field, d.text
		FROM search_docs d
		WHERE d.user_id = ?
		  AND (
		    (d.text ILIKE ? ESCAPE '\')
		    OR (to_tsvector('simple', d.cjk_text) @@ to_tsquery('simple', ?))
		    OR (to_tsvector('simple', d.text) @@ to_tsquery('simple', ?))
		  )
		ORDER BY (d.text ILIKE ? ESCAPE '\') DESC, d.entry_id DESC, d.media_id NULLS LAST
		LIMIT ? OFFSET ?`

	args := []any{userID, pattern, match, match, pattern, limit, offset}
	if match == "" {
		// Without a usable tsquery the two vector conditions are dropped and
		// only the substring match can produce a hit.
		query = `
			SELECT d.entry_id, d.media_id, d.kind, d.field, d.text
			FROM search_docs d
			WHERE d.user_id = ?
			  AND d.text ILIKE ? ESCAPE '\'
			ORDER BY d.entry_id DESC, d.media_id NULLS LAST
			LIMIT ? OFFSET ?`
		args = []any{userID, pattern, limit, offset}
	}

	rows, err := s.db.Raw(query, args...).Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]Result, 0, limit)
	for rows.Next() {
		var (
			entryID uint
			mediaID sql.NullInt64
			kind    string
			field   string
			text    string
		)
		if err := rows.Scan(&entryID, &mediaID, &kind, &field, &text); err != nil {
			return nil, err
		}
		res := Result{EntryID: entryID, Kind: kind, Field: field, Score: 1, Snippet: snippet(text, q)}
		if mediaID.Valid {
			id := uint(mediaID.Int64)
			res.MediaID = &id
		}
		out = append(out, res)
	}
	return out, rows.Err()
}

func appendUnique(dst []Result, seen map[uint]bool, rows []Result) []Result {
	for _, r := range rows {
		key := r.EntryID
		if r.MediaID != nil {
			key = key*1000000 + *r.MediaID
		}
		if seen[key] {
			continue
		}
		seen[key] = true
		dst = append(dst, r)
	}
	return dst
}

// buildCJKQuery builds an AND query over CJK n-gram tokens. Each token is
// quoted so FTS5 treats it literally.
func buildCJKQuery(tokens []string) string {
	parts := make([]string, 0, len(tokens))
	for _, t := range tokens {
		parts = append(parts, `"`+strings.ReplaceAll(t, `"`, `""`)+`"`)
	}
	return strings.Join(parts, " ")
}

// quotePhrase turns arbitrary user input into a safe FTS5 phrase.
func quotePhrase(q string) string {
	return `"` + strings.ReplaceAll(q, `"`, `""`) + `"`
}

// sanitizePrefix keeps only characters that are safe in an FTS5 prefix query.
func sanitizePrefix(q string) string {
	var b strings.Builder
	for _, r := range q {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// postgresTsQuery builds a tsquery expression for the term.
//
// The expression is handed to to_tsquery as a parameter, so it has to be a
// valid tsquery and nothing else. Every lexeme is therefore built from
// letters and digits only and is quoted, which makes the apostrophes and
// the other punctuation of the term harmless. An empty result means the term
// has no word at all and the vector conditions are dropped.
func postgresTsQuery(q string) string {
	if ContainsCJK(q) {
		tokens := CJKQueryTokens(q)
		parts := make([]string, 0, len(tokens))
		for _, t := range tokens {
			parts = append(parts, "'"+strings.ReplaceAll(t, "'", "''")+"'")
		}
		return strings.Join(parts, " & ")
	}

	words := strings.Fields(q)
	parts := make([]string, 0, len(words))
	for _, w := range words {
		clean := sanitizePrefix(w)
		if clean == "" {
			continue
		}
		parts = append(parts, "'"+clean+"':*")
	}
	return strings.Join(parts, " & ")
}

// escapeLike escapes the wildcard characters of a LIKE pattern so that a
// term is matched literally.
func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

func runeLen(s string) int {
	return len([]rune(s))
}

// snippet returns a short excerpt around the first match of the query.
func snippet(text, q string) string {
	text = strings.Join(strings.Fields(text), " ")
	if len([]rune(text)) <= 160 {
		return text
	}
	lower := strings.ToLower(text)
	idx := strings.Index(lower, strings.ToLower(q))
	if idx < 0 {
		return string([]rune(text)[:160]) + "…"
	}
	runes := []rune(text)
	start := len([]rune(text[:idx]))
	start -= 40
	if start < 0 {
		start = 0
	}
	end := start + 160
	if end > len(runes) {
		end = len(runes)
	}
	out := string(runes[start:end])
	if start > 0 {
		out = "…" + out
	}
	if end < len(runes) {
		out += "…"
	}
	return out
}

// ParseKeywords decodes a stored JSON keyword list.
func ParseKeywords(raw string) []string {
	if raw == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil
	}
	return out
}
