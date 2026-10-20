package search

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/wei/journal/backend/internal/db"
	"github.com/wei/journal/backend/internal/models"
)

// env is an isolated search stack: a throw away SQLite database and the
// search service bound to it. Every test gets its own environment so no
// state leaks between tests.
type env struct {
	t      *testing.T
	svc    *Service
	handle *db.Handle
}

// newEnv opens a temporary database, applies the migrations and returns a
// search service bound to it.
func newEnv(t *testing.T) *env {
	t.Helper()
	dir := t.TempDir()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	handle, err := db.Open("sqlite://"+filepath.Join(dir, "test.db"), log)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { handle.Close() })
	svc := NewService(handle.DB(), handle.Dialect)
	return &env{t: t, svc: svc, handle: handle}
}

// createEntry stores an entry owned by userID and returns its id.
func (e *env) createEntry(userID uint, title, text string) uint {
	e.t.Helper()
	now := time.Now().UTC()
	entry := models.Entry{
		UserID:    userID,
		Title:     title,
		PlainText: text,
		EventTime: now,
		EventDate: now.Format("2006-01-02"),
		Timezone:  "UTC",
	}
	if err := e.handle.DB().Create(&entry).Error; err != nil {
		e.t.Fatalf("create entry: %v", err)
	}
	return entry.ID
}

// entryDocs builds the search documents of an entry the same way
// internal/indexer.RebuildEntry does: the title, the plain text and every
// tag name become their own document. The indexer and the journal package
// both import this package, so an in package test cannot call them without
// creating an import cycle; the documents they would produce are built here
// instead.
func (e *env) entryDocs(userID, entryID uint) []Doc {
	e.t.Helper()
	var entry models.Entry
	if err := e.handle.DB().Where("id = ? AND user_id = ?", entryID, userID).First(&entry).Error; err != nil {
		e.t.Fatalf("load entry: %v", err)
	}
	var docs []Doc
	if v := strings.TrimSpace(entry.Title); v != "" {
		docs = append(docs, Doc{Kind: KindTitle, Field: "title", Text: v})
	}
	if v := strings.TrimSpace(entry.PlainText); v != "" {
		docs = append(docs, Doc{Kind: KindText, Field: "text", Text: v})
	}
	var links []models.EntryTag
	if err := e.handle.DB().Where("entry_id = ?", entryID).Find(&links).Error; err != nil {
		e.t.Fatalf("load entry tags: %v", err)
	}
	for _, link := range links {
		var tag models.Tag
		if err := e.handle.DB().Where("id = ? AND user_id = ?", link.TagID, userID).First(&tag).Error; err != nil {
			e.t.Fatalf("load tag: %v", err)
		}
		if v := strings.TrimSpace(tag.Name); v != "" {
			docs = append(docs, Doc{Kind: KindTag, Field: "tag", Text: v})
		}
	}
	return docs
}

// indexEntry replaces the indexed documents of an entry, exactly like the
// indexer does for the API and the background workers.
func (e *env) indexEntry(userID, entryID uint) {
	e.t.Helper()
	if err := e.svc.ReplaceEntryDocs(userID, entryID, e.entryDocs(userID, entryID)); err != nil {
		e.t.Fatalf("replace entry docs: %v", err)
	}
}

// addTag creates a tag owned by userID, links it to the entry and reindexes
// the entry so the tag becomes searchable.
func (e *env) addTag(userID, entryID uint, name string) {
	e.t.Helper()
	tag := models.Tag{UserID: userID, Name: name, NormalizedName: strings.ToLower(name)}
	if err := e.handle.DB().Create(&tag).Error; err != nil {
		e.t.Fatalf("create tag: %v", err)
	}
	link := models.EntryTag{EntryID: entryID, TagID: tag.ID}
	if err := e.handle.DB().Create(&link).Error; err != nil {
		e.t.Fatalf("link tag: %v", err)
	}
	e.indexEntry(userID, entryID)
}

// search runs a query on behalf of userID.
func (e *env) search(userID uint, query string, limit int) []Result {
	e.t.Helper()
	results, err := e.svc.Search(userID, QueryOptions{Query: query, Limit: limit})
	if err != nil {
		e.t.Fatalf("search %q: %v", query, err)
	}
	return results
}

// entryIDs returns the entry ids of a result set, in order.
func entryIDs(results []Result) []uint {
	out := make([]uint, 0, len(results))
	for _, r := range results {
		out = append(out, r.EntryID)
	}
	return out
}

// containsEntry reports whether the result set holds the given entry.
func containsEntry(results []Result, entryID uint) bool {
	for _, r := range results {
		if r.EntryID == entryID {
			return true
		}
	}
	return false
}

// docCount counts the indexed documents of a user.
func (e *env) docCount(userID uint) int64 {
	e.t.Helper()
	var n int64
	if err := e.handle.DB().Table("search_docs").Where("user_id = ?", userID).Count(&n).Error; err != nil {
		e.t.Fatalf("count search docs: %v", err)
	}
	return n
}

func TestIsCJKAndContainsCJK(t *testing.T) {
	cases := []struct {
		name     string
		rune     rune
		wantCJK  bool
		contains string
	}{
		{name: "han", rune: '海', wantCJK: true},
		{name: "hiragana", rune: 'ひ', wantCJK: true},
		{name: "katakana", rune: 'ア', wantCJK: true},
		{name: "hangul", rune: '한', wantCJK: true},
		{name: "latin", rune: 'a', wantCJK: false},
		{name: "digit", rune: '3', wantCJK: false},
		{name: "punctuation", rune: '。', wantCJK: false},
		{name: "space", rune: ' ', wantCJK: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := IsCJK(tc.rune); got != tc.wantCJK {
				t.Fatalf("IsCJK(%q) = %v, want %v", tc.rune, got, tc.wantCJK)
			}
		})
	}

	contains := []struct {
		name string
		in   string
		want bool
	}{
		{name: "empty", in: "", want: false},
		{name: "latin only", in: "beach", want: false},
		{name: "digits only", in: "2024", want: false},
		{name: "han run", in: "海边", want: true},
		{name: "single han", in: "海", want: true},
		{name: "mixed", in: "beach 海边 day", want: true},
		{name: "hiragana", in: "ひらがな", want: true},
	}
	for _, tc := range contains {
		t.Run("contains/"+tc.name, func(t *testing.T) {
			if got := ContainsCJK(tc.in); got != tc.want {
				t.Fatalf("ContainsCJK(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}
}

func TestExpandCJKProducesUnigramsAndBigrams(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{
			name: "three characters",
			in:   "天气好",
			want: []string{"天", "天气", "气", "气好", "好"},
		},
		{
			name: "two characters",
			in:   "海边",
			want: []string{"海", "海边", "边"},
		},
		{
			name: "single character",
			in:   "海",
			want: []string{"海"},
		},
		{
			name: "latin is dropped",
			in:   "beach",
			want: nil,
		},
		{
			name: "latin next to han is not a bigram",
			in:   "a海b",
			want: []string{"海"},
		},
		{
			name: "empty",
			in:   "",
			want: nil,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := strings.Fields(ExpandCJK(tc.in))
			if len(got) == 0 && len(tc.want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("ExpandCJK(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}

	// A three character string yields its characters and its two character
	// pairs, and nothing else.
	expanded := strings.Fields(ExpandCJK("海边游"))
	want := map[string]bool{"海": true, "边": true, "游": true, "海边": true, "边游": true}
	if len(expanded) != len(want) {
		t.Fatalf("ExpandCJK(%q) = %v, want exactly %d tokens", "海边游", expanded, len(want))
	}
	for _, token := range expanded {
		if !want[token] {
			t.Fatalf("ExpandCJK(%q) produced unexpected token %q", "海边游", token)
		}
	}
}

func TestCJKQueryTokensForShortQueries(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{name: "single character", in: "海", want: []string{"海"}},
		{name: "two characters", in: "海边", want: []string{"海", "海边", "边"}},
		{name: "three characters", in: "海边游", want: []string{"海", "海边", "边", "边游", "游"}},
		{name: "latin only", in: "beach", want: nil},
		{name: "empty", in: "", want: nil},
		{name: "whitespace only", in: "   ", want: nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CJKQueryTokens(tc.in)
			if len(got) == 0 && len(tc.want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("CJKQueryTokens(%q) = %v, want %v", tc.in, got, tc.want)
			}
		})
	}

	// The tokens are quoted so FTS5 treats them literally, and joined with
	// spaces, which FTS5 reads as AND.
	if got, want := buildCJKQuery([]string{"海"}), `"海"`; got != want {
		t.Fatalf("buildCJKQuery = %q, want %q", got, want)
	}
	if got, want := buildCJKQuery(CJKQueryTokens("海边")), `"海" "海边" "边"`; got != want {
		t.Fatalf("buildCJKQuery = %q, want %q", got, want)
	}
	// A double quote inside a token is escaped instead of ending the phrase.
	if got, want := quotePhrase(`a"b`), `"a""b"`; got != want {
		t.Fatalf("quotePhrase = %q, want %q", got, want)
	}
}

func TestNormalizeFoldsCaseAndTrims(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "upper case", in: "BEACH", want: "beach"},
		{name: "mixed case", in: "BeAcH", want: "beach"},
		{name: "leading and trailing space", in: "  beach  ", want: "beach"},
		{name: "tab and newline", in: "\tbeach\n", want: "beach"},
		{name: "inner spaces are kept", in: "sun  set", want: "sun  set"},
		{name: "empty", in: "", want: ""},
		{name: "whitespace only", in: "   \t ", want: ""},
		{name: "chinese is untouched", in: "海边", want: "海边"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Normalize(tc.in); got != tc.want {
				t.Fatalf("Normalize(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestSearchFindsASingleChineseCharacter(t *testing.T) {
	e := newEnv(t)
	entryID := e.createEntry(1, "旅行日志", "今天去海边看海")
	e.indexEntry(1, entryID)

	results := e.search(1, "海", 20)
	if !containsEntry(results, entryID) {
		t.Fatalf("a single character query did not find the entry: %+v", entryIDs(results))
	}
}

func TestSearchFindsATwoCharacterChineseWord(t *testing.T) {
	e := newEnv(t)
	entryID := e.createEntry(1, "旅行日志", "我们去了海边")
	e.indexEntry(1, entryID)

	results := e.search(1, "海边", 20)
	if !containsEntry(results, entryID) {
		t.Fatalf("a two character query did not find the entry: %+v", entryIDs(results))
	}
}

func TestSearchFindsAThreeCharacterChineseWord(t *testing.T) {
	e := newEnv(t)
	entryID := e.createEntry(1, "旅行日志", "在海边玩了一整天")
	e.indexEntry(1, entryID)

	results := e.search(1, "海边玩", 20)
	if !containsEntry(results, entryID) {
		t.Fatalf("a three character query did not find the entry: %+v", entryIDs(results))
	}
}

func TestSearchFindsALatinSubstring(t *testing.T) {
	e := newEnv(t)
	entryID := e.createEntry(1, "Beach day", "we walked on the sand")
	e.indexEntry(1, entryID)

	cases := []struct {
		name  string
		query string
	}{
		{name: "whole word", query: "beach"},
		{name: "four character substring", query: "each"},
		{name: "three character substring", query: "eac"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			results := e.search(1, tc.query, 20)
			if !containsEntry(results, entryID) {
				t.Fatalf("query %q did not find the entry: %+v", tc.query, entryIDs(results))
			}
		})
	}
}

func TestSearchIsCaseInsensitive(t *testing.T) {
	cases := []struct {
		name  string
		text  string
		query string
	}{
		{name: "upper case query", text: "beach", query: "BEACH"},
		{name: "mixed case query", text: "beach", query: "BeAcH"},
		{name: "upper case document", text: "BEACH", query: "beach"},
		{name: "mixed case document", text: "BeAcH", query: "beach"},
		{name: "upper case substring", text: "beach", query: "EACH"},
		// A substring can only be found by the trigram index, so these two
		// cases pin the case folding of the document side as well.
		{name: "upper case document substring", text: "BEACH", query: "each"},
		{name: "mixed case document substring", text: "BeAcH", query: "each"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			e := newEnv(t)
			entryID := e.createEntry(1, "note", tc.text)
			e.indexEntry(1, entryID)

			results := e.search(1, tc.query, 20)
			if !containsEntry(results, entryID) {
				t.Fatalf("query %q did not find the document %q: %+v", tc.query, tc.text, entryIDs(results))
			}
		})
	}
}

func TestSearchMatchesTitles(t *testing.T) {
	e := newEnv(t)
	entryID := e.createEntry(1, "海边日记", "今天天气不错")
	e.indexEntry(1, entryID)

	results := e.search(1, "海边", 20)
	if !containsEntry(results, entryID) {
		t.Fatalf("a title only match was not found: %+v", entryIDs(results))
	}
	found := false
	for _, r := range results {
		if r.EntryID == entryID && r.Kind == KindTitle {
			found = true
		}
	}
	if !found {
		t.Fatalf("the title hit is missing from the results: %+v", results)
	}
}

func TestSearchMatchesTags(t *testing.T) {
	e := newEnv(t)
	entryID := e.createEntry(1, "周末", "去公园散步")
	e.addTag(1, entryID, "海风")

	results := e.search(1, "海风", 20)
	if !containsEntry(results, entryID) {
		t.Fatalf("a tag only match was not found: %+v", entryIDs(results))
	}
	found := false
	for _, r := range results {
		if r.EntryID == entryID && r.Kind == KindTag {
			found = true
		}
	}
	if !found {
		t.Fatalf("the tag hit is missing from the results: %+v", results)
	}
}

func TestSearchIsScopedToTheOwner(t *testing.T) {
	e := newEnv(t)
	aliceEntry := e.createEntry(1, "Hidden treasure", "a very distinctive phrase about penguins")
	e.indexEntry(1, aliceEntry)
	bobEntry := e.createEntry(2, "Bob entry", "nothing to see here")
	e.indexEntry(2, bobEntry)

	for _, query := range []string{"penguins", "treasure", "distinctive", "phrase"} {
		results := e.search(2, query, 20)
		for _, r := range results {
			if r.EntryID == aliceEntry {
				t.Fatalf("query %q leaked another account's entry: %+v", query, entryIDs(results))
			}
		}
	}
	// The other way round is isolated as well.
	for _, query := range []string{"here", "nothing", "Bob"} {
		results := e.search(1, query, 20)
		for _, r := range results {
			if r.EntryID == bobEntry {
				t.Fatalf("query %q leaked another account's entry: %+v", query, entryIDs(results))
			}
		}
	}

	// The owner still finds their own documents.
	if results := e.search(1, "penguins", 20); !containsEntry(results, aliceEntry) {
		t.Fatalf("the owner did not find their own entry: %+v", entryIDs(results))
	}
	// And the other account still finds its own.
	if results := e.search(2, "here", 20); !containsEntry(results, bobEntry) {
		t.Fatalf("the second account did not find its own entry: %+v", entryIDs(results))
	}
}

func TestSearchRanksOrLimitsResults(t *testing.T) {
	e := newEnv(t)
	var ids []uint
	for i := 0; i < 5; i++ {
		id := e.createEntry(1, "sunset", "another sunset over the sea")
		e.indexEntry(1, id)
		ids = append(ids, id)
	}

	// A limit above the number of matches returns every match and nothing
	// more.
	results := e.search(1, "sunset", 20)
	if len(results) != len(ids) {
		t.Fatalf("expected %d hits, got %d: %+v", len(ids), len(results), entryIDs(results))
	}
	if len(results) > 20 {
		t.Fatalf("the limit of 20 was not respected, got %d hits", len(results))
	}
	// Every hit belongs to the archive that was indexed.
	for _, r := range results {
		found := false
		for _, id := range ids {
			if id == r.EntryID {
				found = true
			}
		}
		if !found {
			t.Fatalf("unexpected entry %d in the results", r.EntryID)
		}
	}
	// The same entry is never reported twice.
	seen := map[uint]bool{}
	for _, r := range results {
		if seen[r.EntryID] {
			t.Fatalf("entry %d was reported twice", r.EntryID)
		}
		seen[r.EntryID] = true
	}
	// The hits are ranked: a later hit never scores better than an earlier
	// one.
	for i := 1; i < len(results); i++ {
		if results[i].Score > results[i-1].Score {
			t.Fatalf("hit %d scores %f, better than the previous hit %f", i, results[i].Score, results[i-1].Score)
		}
	}
	// Equal scores keep a stable order: the same query twice returns the
	// same hits in the same order.
	again := e.search(1, "sunset", 20)
	if !reflect.DeepEqual(entryIDs(results), entryIDs(again)) {
		t.Fatalf("the order is not deterministic: %v then %v", entryIDs(results), entryIDs(again))
	}

	// The service reads four times the requested limit from its FTS tables
	// and never trims the merged hit list, so a limit below the number of
	// matches is not enforced by the service (the HTTP layer trims the
	// grouped entries instead, internal/api/search.go). Assert the bound the
	// service does guarantee, so a regression that returns even more hits is
	// caught.
	small := e.search(1, "sunset", 2)
	if len(small) > 4*2 {
		t.Fatalf("the service returned %d hits for a limit of 2, more than the %d it may read", len(small), 4*2)
	}
}

func TestSearchHandlesAnEmptyQuery(t *testing.T) {
	e := newEnv(t)
	entryID := e.createEntry(1, "beach", "a day at the beach")
	e.indexEntry(1, entryID)

	for _, query := range []string{"", " ", "   ", "\t", "\n"} {
		results, err := e.svc.Search(1, QueryOptions{Query: query, Limit: 20})
		if err != nil {
			t.Fatalf("query %q returned an error: %v", query, err)
		}
		if len(results) != 0 {
			t.Fatalf("query %q returned %d results, want none: %+v", query, len(results), entryIDs(results))
		}
	}
}

func TestRemoveEntryDocsRemovesTheDocumentFromTheIndex(t *testing.T) {
	e := newEnv(t)
	entryID := e.createEntry(1, "beach", "a day at the beach")
	e.indexEntry(1, entryID)

	if results := e.search(1, "beach", 20); !containsEntry(results, entryID) {
		t.Fatalf("the entry was not indexed: %+v", entryIDs(results))
	}

	if err := e.svc.RemoveEntryDocs(1, entryID); err != nil {
		t.Fatalf("remove entry docs: %v", err)
	}
	if n := e.docCount(1); n != 0 {
		t.Fatalf("the index still holds %d documents", n)
	}
	if results := e.search(1, "beach", 20); containsEntry(results, entryID) {
		t.Fatalf("the removed entry is still returned: %+v", entryIDs(results))
	}
}

func TestReplaceEntryDocsReplacesThePreviousDocuments(t *testing.T) {
	e := newEnv(t)
	entryID := e.createEntry(1, "note", "the old text mentions a pelican")
	e.indexEntry(1, entryID)

	if results := e.search(1, "pelican", 20); !containsEntry(results, entryID) {
		t.Fatalf("the entry was not indexed: %+v", entryIDs(results))
	}
	before := e.docCount(1)
	if before == 0 {
		t.Fatal("the entry was not indexed at all")
	}

	e.handle.DB().Model(&models.Entry{}).Where("id = ?", entryID).Update("plain_text", "the new text mentions a walrus")
	e.indexEntry(1, entryID)

	if results := e.search(1, "pelican", 20); containsEntry(results, entryID) {
		t.Fatalf("the replaced document is still returned: %+v", entryIDs(results))
	}
	results := e.search(1, "walrus", 20)
	if !containsEntry(results, entryID) {
		t.Fatalf("the new document was not found: %+v", entryIDs(results))
	}
	// The replacement swaps the documents instead of adding to them.
	if n := e.docCount(1); n != before {
		t.Fatalf("the entry holds %d documents, want %d", n, before)
	}
}

// TestPostgresSearchFindsEntries runs the search against a live PostgreSQL
// server, because the postgres dialect builds its own SQL and the SQLite
// tests cannot reach it. It is skipped unless a server URL is provided.
func TestPostgresSearchFindsEntries(t *testing.T) {
	dsn := os.Getenv("WJ_TEST_POSTGRES_URL")
	if dsn == "" {
		t.Skip("PostgreSQL is not available in this environment; set WJ_TEST_POSTGRES_URL to run the postgres dialect tests")
	}

	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	handle, err := db.Open(dsn, log)
	if err != nil {
		t.Fatalf("open postgres database: %v", err)
	}
	t.Cleanup(func() { handle.Close() })
	if handle.Dialect != "postgres" {
		t.Fatalf("the test server is on the %q dialect", handle.Dialect)
	}
	svc := NewService(handle.DB(), handle.Dialect)

	now := time.Now().UTC()
	entry := models.Entry{
		UserID:    4242,
		Title:     "海边的一天 Beach day",
		PlainText: "今天去了海边，天气很好。Walked along the beach with the dog.",
		EventTime: now,
		EventDate: now.Format("2006-01-02"),
		Timezone:  "UTC",
	}
	if err := handle.DB().Create(&entry).Error; err != nil {
		t.Fatalf("create entry: %v", err)
	}
	docs := []Doc{
		{Kind: KindTitle, Field: "title", Text: entry.Title},
		{Kind: KindText, Field: "text", Text: entry.PlainText},
	}
	if err := svc.ReplaceEntryDocs(entry.UserID, entry.ID, docs); err != nil {
		t.Fatalf("replace entry docs: %v", err)
	}

	queries := []string{"海", "海边", "今天", "beach", "BEACH", "each"}
	for _, q := range queries {
		results, err := svc.Search(entry.UserID, QueryOptions{Query: q, Limit: 20})
		if err != nil {
			t.Fatalf("the query %q failed: %v", q, err)
		}
		if !containsEntry(results, entry.ID) {
			t.Errorf("the query %q did not find the entry: %+v", q, entryIDs(results))
		}
	}

	// A second user must never see the first user's entry.
	other, err := svc.Search(entry.UserID+1, QueryOptions{Query: "beach", Limit: 20})
	if err != nil {
		t.Fatalf("search for the other user: %v", err)
	}
	if len(other) != 0 {
		t.Errorf("the other user got %d results: %+v", len(other), entryIDs(other))
	}
}
