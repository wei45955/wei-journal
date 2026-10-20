package db

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"log/slog"
	"sort"
	"strconv"
	"strings"
	"time"
)

//go:embed migrations/sqlite/*.sql migrations/postgres/*.sql
var migrationFS embed.FS

// Migrator applies versioned, embedded SQL migrations. Each migration runs
// inside a transaction and is recorded in schema_migrations, so an
// interrupted upgrade never leaves a half applied schema behind.
type Migrator struct {
	db      *sql.DB
	dialect string
	log     *slog.Logger
}

type migration struct {
	version int
	name    string
	body    string
}

// NewMigrator builds a migrator for the given dialect ("sqlite" or "postgres").
func NewMigrator(db *sql.DB, dialect string, log *slog.Logger) *Migrator {
	return &Migrator{db: db, dialect: dialect, log: log}
}

// Up applies every pending migration and returns the resulting schema version.
func (m *Migrator) Up() (int, error) {
	if err := m.ensureTable(); err != nil {
		return 0, err
	}
	current, err := m.currentVersion()
	if err != nil {
		return 0, err
	}
	migrations, err := m.load()
	if err != nil {
		return 0, err
	}
	for _, mig := range migrations {
		if mig.version <= current {
			continue
		}
		if err := m.apply(mig); err != nil {
			return 0, fmt.Errorf("migration %04d_%s: %w", mig.version, mig.name, err)
		}
		m.log.Info("applied migration", "version", mig.version, "name", mig.name)
		current = mig.version
	}
	return current, nil
}

func (m *Migrator) ensureTable() error {
	stmt := `CREATE TABLE IF NOT EXISTS schema_migrations (
		version BIGINT PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		applied_at TIMESTAMP NOT NULL
	)`
	if _, err := m.db.Exec(stmt); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	return nil
}

func (m *Migrator) currentVersion() (int, error) {
	var version sql.NullInt64
	err := m.db.QueryRow(`SELECT MAX(version) FROM schema_migrations`).Scan(&version)
	if err != nil {
		return 0, fmt.Errorf("read schema version: %w", err)
	}
	if !version.Valid {
		return 0, nil
	}
	return int(version.Int64), nil
}

func (m *Migrator) load() ([]migration, error) {
	dir := fmt.Sprintf("migrations/%s", m.dialect)
	entries, err := fs.ReadDir(migrationFS, dir)
	if err != nil {
		return nil, fmt.Errorf("read migrations for %s: %w", m.dialect, err)
	}
	out := make([]migration, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
			continue
		}
		parts := strings.SplitN(e.Name(), "_", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("malformed migration filename %q", e.Name())
		}
		version, err := strconv.Atoi(parts[0])
		if err != nil {
			return nil, fmt.Errorf("malformed migration version in %q: %w", e.Name(), err)
		}
		body, err := migrationFS.ReadFile(dir + "/" + e.Name())
		if err != nil {
			return nil, err
		}
		name := strings.TrimSuffix(parts[1], ".sql")
		out = append(out, migration{version: version, name: name, body: string(body)})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].version < out[j].version })
	return out, nil
}

func (m *Migrator) apply(mig migration) error {
	tx, err := m.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // no-op once committed

	for _, stmt := range splitStatements(mig.body) {
		if _, err := tx.Exec(stmt); err != nil {
			return fmt.Errorf("exec failed: %w\nstatement: %s", err, truncate(stmt, 400))
		}
	}
	insert := `INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)`
	if m.dialect == "postgres" {
		insert = `INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, $3)`
	}
	if _, err := tx.Exec(insert, mig.version, mig.name, nowUTC()); err != nil {
		return err
	}
	return tx.Commit()
}

// splitStatements breaks a SQL file into individual statements. It keeps
// dollar-quoted bodies and SQLite trigger bodies (BEGIN ... END) intact,
// because both contain semicolons that do not end a statement.
func splitStatements(body string) []string {
	var out []string
	var current strings.Builder
	inSingle, inDouble, inLineComment := false, false, false
	inDollar := false
	dollarTag := ""

	// Trigger bodies are counted so the terminating semicolon is only
	// recognised at the top level of the body.
	var (
		inTrigger bool
		trigDepth int
		caseDepth int
		word      strings.Builder
		// headWords holds the first words of the statement that is being
		// read. They decide whether a statement opens a trigger.
		headWords []string
	)

	// handleWord is called for every complete word that appears outside of a
	// string, a comment or a dollar-quoted body.
	handleWord := func(w string) {
		upper := strings.ToUpper(w)
		if !inTrigger {
			// A trigger body is a block of statements between BEGIN and END.
			// Only a real CREATE TRIGGER statement has one, so the word is
			// looked for in the head of the statement that is being read.
			// A function that returns a trigger is not a trigger.
			if upper == "TRIGGER" && opensTrigger(headWords) {
				inTrigger = true
			}
			if len(headWords) < 4 {
				headWords = append(headWords, upper)
			}
			return
		}
		switch upper {
		case "BEGIN":
			trigDepth++
		case "CASE":
			caseDepth++
		case "END":
			if caseDepth > 0 {
				caseDepth--
			} else if trigDepth > 0 {
				trigDepth--
			}
		}
	}

	// flushWord hands the word that is being read over to handleWord. It
	// runs before every character that ends a word, so that the last word
	// of a statement is never lost.
	flushWord := func() {
		if word.Len() > 0 {
			handleWord(word.String())
			word.Reset()
		}
	}

	flush := func() {
		s := strings.TrimSpace(current.String())
		if s != "" {
			out = append(out, s)
		}
		current.Reset()
		inTrigger = false
		trigDepth = 0
		caseDepth = 0
		headWords = nil
	}

	runes := []rune(body)
	for i := 0; i < len(runes); i++ {
		c := runes[i]
		next := rune(0)
		if i+1 < len(runes) {
			next = runes[i+1]
		}
		switch {
		case inLineComment:
			if c == '\n' {
				inLineComment = false
				current.WriteRune(c)
			}
			continue
		case inDollar:
			current.WriteRune(c)
			if c == '$' && strings.HasPrefix(string(runes[i:]), dollarTag) {
				// write the remaining tag characters
				for j := 1; j < len(dollarTag); j++ {
					if i+j < len(runes) {
						current.WriteRune(runes[i+j])
					}
				}
				i += len(dollarTag) - 1
				inDollar = false
			}
			continue
		case inSingle:
			current.WriteRune(c)
			if c == '\'' {
				inSingle = false
			}
			continue
		case inDouble:
			current.WriteRune(c)
			if c == '"' {
				inDouble = false
			}
			continue
		}

		switch {
		case c == '-' && next == '-':
			flushWord()
			inLineComment = true
			i++
		case c == '\'':
			flushWord()
			inSingle = true
			current.WriteRune(c)
		case c == '"':
			flushWord()
			inDouble = true
			current.WriteRune(c)
		case c == '$':
			flushWord()
			tag := dollarTagAt(runes, i)
			if tag != "" {
				inDollar = true
				dollarTag = tag
				current.WriteString(tag)
				i += len(tag) - 1
			} else {
				current.WriteRune(c)
			}
		case c == ';':
			// The word before the semicolon has to be handled first. Without
			// this the "END" that closes a trigger body would be lost and the
			// body would never be closed.
			flushWord()
			if inTrigger && (trigDepth > 0 || caseDepth > 0) {
				// Still inside the trigger body, so this semicolon belongs
				// to the statement that is being accumulated.
				current.WriteRune(c)
				continue
			}
			flush()
		case isWordRune(c):
			word.WriteRune(c)
			current.WriteRune(c)
		default:
			flushWord()
			current.WriteRune(c)
		}
	}
	flushWord()
	flush()
	return out
}

// opensTrigger reports whether the words that open a statement make it a
// trigger. Only "CREATE TRIGGER", "CREATE OR REPLACE TRIGGER" and their
// temporary variants do; a function that returns a trigger is not one.
//
// The words are expected in upper case, as the splitter stores them.
func opensTrigger(head []string) bool {
	if len(head) == 0 || head[0] != "CREATE" {
		return false
	}
	rest := head[1:]
	if len(rest) > 0 && rest[0] == "OR" {
		rest = rest[1:]
		if len(rest) > 0 && rest[0] == "REPLACE" {
			rest = rest[1:]
		}
	}
	if len(rest) > 0 && (rest[0] == "TEMP" || rest[0] == "TEMPORARY") {
		rest = rest[1:]
	}
	return len(rest) == 0
}

func isWordRune(c rune) bool {
	return c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
}

// dollarTagAt returns the dollar-quote tag ($$ or $name$) starting at i.
func dollarTagAt(runes []rune, i int) string {
	if i >= len(runes) || runes[i] != '$' {
		return ""
	}
	for j := i + 1; j < len(runes); j++ {
		c := runes[j]
		if c == '$' {
			return string(runes[i : j+1])
		}
		if !(c == '_' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')) {
			return ""
		}
	}
	return ""
}

// nowUTC returns the current time in UTC, the single time reference used by
// the schema.
func nowUTC() time.Time { return time.Now().UTC() }

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
