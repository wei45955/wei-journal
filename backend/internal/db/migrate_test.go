package db

import (
	"database/sql"
	"io"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	_ "github.com/glebarez/sqlite" // registers the "sqlite" database/sql driver
)

// expectedTables are the application tables the embedded migrations create,
// plus the bookkeeping table the migrator maintains itself. The list mirrors
// internal/db/migrations/sqlite/0001_init.sql.
var expectedTables = []string{
	"ai_metadata",
	"entries",
	"entry_tags",
	"folders",
	"jobs",
	"locations",
	"media_assets",
	"schema_migrations",
	"search_cjk",
	"search_docs",
	"search_fts",
	"search_words",
	"sessions",
	"tags",
	"user_settings",
	"users",
}

// ftsVirtualTables are the FTS5 virtual tables of the SQLite schema. SQLite
// creates internal shadow tables for them, which are an implementation
// detail rather than part of the application schema.
var ftsVirtualTables = []string{"search_fts", "search_cjk", "search_words"}

// discardLogger returns a logger that throws every record away so the tests
// stay quiet.
func discardLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

// openRawDB opens a SQLite database inside a temporary directory without
// running any migration, so a test can drive the migrator by hand.
func openRawDB(t *testing.T) *sql.DB {
	t.Helper()
	path := filepath.Join(t.TempDir(), "migrate.db")
	sqlDB, err := sql.Open("sqlite", sqliteDSN(path))
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	// A single connection keeps the transaction and the follow up queries
	// strictly ordered.
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := sqlDB.Ping(); err != nil {
		t.Fatalf("ping sqlite: %v", err)
	}
	return sqlDB
}

// openMigratedDB opens the database the way the application does, which also
// applies every pending migration.
func openMigratedDB(t *testing.T) *sql.DB {
	t.Helper()
	dir := t.TempDir()
	handle, err := Open("sqlite://"+filepath.Join(dir, "migrate.db"), discardLogger())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })
	return handle.SQL
}

// tableExists reports whether a table (virtual tables included) is present.
func tableExists(t *testing.T, sqlDB *sql.DB, name string) bool {
	t.Helper()
	var found string
	err := sqlDB.QueryRow(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, name,
	).Scan(&found)
	if err == sql.ErrNoRows {
		return false
	}
	if err != nil {
		t.Fatalf("look up table %q: %v", name, err)
	}
	return true
}

// listTables returns every user table of the database, sorted by name. The
// internal sqlite_% tables are left out.
func listTables(t *testing.T, sqlDB *sql.DB) []string {
	t.Helper()
	rows, err := sqlDB.Query(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
	)
	if err != nil {
		t.Fatalf("list tables: %v", err)
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan table name: %v", err)
		}
		out = append(out, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate tables: %v", err)
	}
	return out
}

// isFTSShadowTable reports whether a table is one of the internal shadow
// tables SQLite creates for an FTS5 virtual table.
func isFTSShadowTable(name string) bool {
	for _, vt := range ftsVirtualTables {
		if strings.HasPrefix(name, vt+"_") {
			return true
		}
	}
	return false
}

// migrationRow is one recorded row of the schema_migrations table.
type migrationRow struct {
	version   int64
	name      string
	appliedAt time.Time
}

// readMigrationRows returns every row of schema_migrations ordered by version.
func readMigrationRows(t *testing.T, sqlDB *sql.DB) []migrationRow {
	t.Helper()
	rows, err := sqlDB.Query(
		`SELECT version, name, applied_at FROM schema_migrations ORDER BY version`,
	)
	if err != nil {
		t.Fatalf("read schema_migrations: %v", err)
	}
	defer rows.Close()

	var out []migrationRow
	for rows.Next() {
		var row migrationRow
		if err := rows.Scan(&row.version, &row.name, &row.appliedAt); err != nil {
			t.Fatalf("scan schema_migrations row: %v", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate schema_migrations: %v", err)
	}
	return out
}

func TestMigrationsCreateTheExpectedTables(t *testing.T) {
	sqlDB := openMigratedDB(t)

	got := listTables(t, sqlDB)
	present := make(map[string]bool, len(got))
	for _, name := range got {
		present[name] = true
	}

	for _, want := range expectedTables {
		if !present[want] {
			t.Errorf("table %q is missing after the migrations ran; got %v", want, got)
		}
	}

	expected := make(map[string]bool, len(expectedTables))
	for _, name := range expectedTables {
		expected[name] = true
	}
	var unexpected []string
	for _, name := range got {
		if isFTSShadowTable(name) {
			continue
		}
		if !expected[name] {
			unexpected = append(unexpected, name)
		}
	}
	if len(unexpected) > 0 {
		t.Errorf("unexpected tables after the migrations ran: %v (all tables: %v)", unexpected, got)
	}
}

func TestMigratorAppliesMigrationsOnce(t *testing.T) {
	sqlDB := openRawDB(t)
	m := NewMigrator(sqlDB, "sqlite", discardLogger())

	migrations, err := m.load()
	if err != nil {
		t.Fatalf("load migrations: %v", err)
	}
	if len(migrations) == 0 {
		t.Fatal("no embedded sqlite migrations were found")
	}

	version, err := m.Up()
	if err != nil {
		t.Fatalf("Up: %v", err)
	}
	last := migrations[len(migrations)-1]
	if version != last.version {
		t.Errorf("Up returned version %d, want %d", version, last.version)
	}

	rows := readMigrationRows(t, sqlDB)
	if len(rows) != len(migrations) {
		t.Fatalf("schema_migrations holds %d rows, want one per migration file (%d)", len(rows), len(migrations))
	}
	for i, mig := range migrations {
		if rows[i].version != int64(mig.version) {
			t.Errorf("row %d: version %d, want %d", i, rows[i].version, mig.version)
		}
		if rows[i].name != mig.name {
			t.Errorf("row %d: name %q, want %q", i, rows[i].name, mig.name)
		}
	}
}

func TestMigratorDoesNotApplyAMigrationsTwice(t *testing.T) {
	sqlDB := openRawDB(t)
	m := NewMigrator(sqlDB, "sqlite", discardLogger())

	first, err := m.Up()
	if err != nil {
		t.Fatalf("first Up: %v", err)
	}
	before := readMigrationRows(t, sqlDB)
	if len(before) == 0 {
		t.Fatal("the first Up recorded no migration")
	}

	// The migrations are not written with IF NOT EXISTS, so a second run
	// that re-executed them would fail on the existing tables. A clean
	// error free run therefore proves that nothing was applied again.
	second, err := m.Up()
	if err != nil {
		t.Fatalf("second Up: %v", err)
	}
	after := readMigrationRows(t, sqlDB)

	if second != first {
		t.Errorf("the second Up returned version %d, want %d", second, first)
	}
	if len(after) != len(before) {
		t.Fatalf("schema_migrations holds %d rows after the second Up, want %d", len(after), len(before))
	}
	for i := range before {
		if after[i].version != before[i].version {
			t.Errorf("row %d: version changed from %d to %d", i, before[i].version, after[i].version)
		}
		if after[i].name != before[i].name {
			t.Errorf("row %d: name changed from %q to %q", i, before[i].name, after[i].name)
		}
		if !after[i].appliedAt.Equal(before[i].appliedAt) {
			t.Errorf("row %d: applied_at changed from %s to %s", i, before[i].appliedAt, after[i].appliedAt)
		}
	}
}

func TestFailingMigrationLeavesTheSchemaVersionAlone(t *testing.T) {
	sqlDB := openRawDB(t)
	m := NewMigrator(sqlDB, "sqlite", discardLogger())
	if err := m.ensureTable(); err != nil {
		t.Fatalf("ensureTable: %v", err)
	}

	// A healthy migration first, so that the current version is not the
	// zero value and a change is actually detectable.
	if err := m.apply(migration{
		version: 1,
		name:    "baseline",
		body:    "CREATE TABLE baseline_marker (id INTEGER PRIMARY KEY);",
	}); err != nil {
		t.Fatalf("apply baseline migration: %v", err)
	}
	// Positive control: a migration that succeeds really does leave its
	// table behind, so the rollback check below is not vacuous.
	if !tableExists(t, sqlDB, "baseline_marker") {
		t.Fatal("the successful migration did not create its table")
	}
	before, err := m.currentVersion()
	if err != nil {
		t.Fatalf("currentVersion: %v", err)
	}
	if before != 1 {
		t.Fatalf("current version is %d, want 1", before)
	}

	broken := migration{
		version: 2,
		name:    "broken",
		body: `CREATE TABLE broken_leftover (id INTEGER PRIMARY KEY);
THIS IS NOT VALID SQL;`,
	}
	if err := m.apply(broken); err == nil {
		t.Fatal("apply of a broken migration returned no error")
	}

	after, err := m.currentVersion()
	if err != nil {
		t.Fatalf("currentVersion after the failed migration: %v", err)
	}
	if after != before {
		t.Errorf("the schema version moved from %d to %d after a failed migration", before, after)
	}

	if tableExists(t, sqlDB, "broken_leftover") {
		t.Error("the table created by the failed migration survived the rollback")
	}

	var recorded int
	if err := sqlDB.QueryRow(
		`SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, broken.version,
	).Scan(&recorded); err != nil {
		t.Fatalf("count schema_migrations rows: %v", err)
	}
	if recorded != 0 {
		t.Errorf("schema_migrations holds %d rows for version %d, want 0", recorded, broken.version)
	}
}

func TestApplyIsTransactional(t *testing.T) {
	sqlDB := openRawDB(t)
	m := NewMigrator(sqlDB, "sqlite", discardLogger())
	if err := m.ensureTable(); err != nil {
		t.Fatalf("ensureTable: %v", err)
	}

	broken := migration{
		version: 7,
		name:    "partially_applied",
		body: `CREATE TABLE tx_first (id INTEGER PRIMARY KEY);
CREATE TABLE tx_second (id INTEGER PRIMARY KEY);
INSERT INTO tx_missing (id) VALUES (1);`,
	}
	if err := m.apply(broken); err == nil {
		t.Fatal("apply of a broken migration returned no error")
	}

	// Positive control: a migration that succeeds really does leave its
	// table behind, so the rollback check below is not vacuous.
	if err := m.apply(migration{
		version: 8,
		name:    "control",
		body:    "CREATE TABLE tx_control (id INTEGER PRIMARY KEY);",
	}); err != nil {
		t.Fatalf("apply control migration: %v", err)
	}
	if !tableExists(t, sqlDB, "tx_control") {
		t.Fatal("the successful migration did not create its table")
	}

	for _, name := range []string{"tx_first", "tx_second"} {
		if tableExists(t, sqlDB, name) {
			t.Errorf("table %q survived the failed migration, want it rolled back", name)
		}
	}

	var recorded int
	if err := sqlDB.QueryRow(
		`SELECT COUNT(*) FROM schema_migrations WHERE version = ?`, broken.version,
	).Scan(&recorded); err != nil {
		t.Fatalf("count schema_migrations rows: %v", err)
	}
	if recorded != 0 {
		t.Errorf("schema_migrations holds %d rows for version %d, want 0", recorded, broken.version)
	}
}

func TestCurrentVersionOnAnEmptyDatabase(t *testing.T) {
	sqlDB := openRawDB(t)
	m := NewMigrator(sqlDB, "sqlite", discardLogger())

	// Without the bookkeeping table the version cannot be read at all, and
	// the loader has to say so instead of inventing a version.
	version, err := m.currentVersion()
	if err == nil {
		t.Errorf("currentVersion on a database without schema_migrations returned %d and no error, want an error", version)
	} else if version != 0 {
		t.Errorf("currentVersion on a database without schema_migrations returned %d, want 0", version)
	}

	if err := m.ensureTable(); err != nil {
		t.Fatalf("ensureTable: %v", err)
	}
	version, err = m.currentVersion()
	if err != nil {
		t.Fatalf("currentVersion on an empty database: %v", err)
	}
	if version != 0 {
		t.Errorf("currentVersion on an empty database is %d, want 0", version)
	}
}

func TestSplitStatements(t *testing.T) {
	cases := []struct {
		name string
		body string
		want []string
	}{
		{
			name: "single statement without terminator",
			body: "SELECT 1",
			want: []string{"SELECT 1"},
		},
		{
			name: "plain multi statement file",
			body: "CREATE TABLE a (id INTEGER);\nCREATE TABLE b (id INTEGER);\n",
			want: []string{"CREATE TABLE a (id INTEGER)", "CREATE TABLE b (id INTEGER)"},
		},
		{
			name: "comment only file",
			body: "-- nothing to do here\n",
			want: nil,
		},
		{
			name: "semicolon inside a string literal",
			body: "INSERT INTO t (a) VALUES ('x;y');",
			want: []string{"INSERT INTO t (a) VALUES ('x;y')"},
		},
		{
			name: "dollar quoted body stays intact",
			body: "CREATE FUNCTION add_one(n INTEGER) RETURNS INTEGER AS $$\n" +
				"BEGIN\n  RETURN n + 1;\nEND;\n$$ LANGUAGE plpgsql;\n" +
				"CREATE TABLE after_function (id INTEGER);",
			want: []string{
				"CREATE FUNCTION add_one(n INTEGER) RETURNS INTEGER AS $$\n" +
					"BEGIN\n  RETURN n + 1;\nEND;\n$$ LANGUAGE plpgsql",
				"CREATE TABLE after_function (id INTEGER)",
			},
		},
		{
			name: "tagged dollar quoted body stays intact",
			body: "CREATE FUNCTION add_two(n INTEGER) RETURNS INTEGER AS $fn$ BEGIN RETURN n + 2; END; $fn$ LANGUAGE plpgsql;\n" +
				"CREATE TABLE after_tagged_function (id INTEGER);",
			want: []string{
				"CREATE FUNCTION add_two(n INTEGER) RETURNS INTEGER AS $fn$ BEGIN RETURN n + 2; END; $fn$ LANGUAGE plpgsql",
				"CREATE TABLE after_tagged_function (id INTEGER)",
			},
		},
		{
			// The whole trigger, including the semicolons of its body, stays
			// in one piece. The semicolon that ends the trigger is dropped
			// like the one of every other statement.
			name: "sqlite trigger body stays intact",
			body: "CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN\n" +
				"  INSERT INTO log (msg) VALUES (new.msg);\n" +
				"  UPDATE t SET seen = 1 WHERE id = new.id;\n" +
				"END;",
			want: []string{
				"CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN\n" +
					"  INSERT INTO log (msg) VALUES (new.msg);\n" +
					"  UPDATE t SET seen = 1 WHERE id = new.id;\n" +
					"END",
			},
		},
		{
			// The statement that follows a trigger is a statement of its
			// own. It used to be swallowed by the trigger, because the END
			// that closes the body was never handed over to the trigger
			// tracking and the body was therefore never closed.
			name: "statement after a trigger is a separate statement",
			body: "CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN\n" +
				"  INSERT INTO log (msg) VALUES (new.msg);\n" +
				"END;\n" +
				"CREATE TABLE after_trigger (id INTEGER);",
			want: []string{
				"CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN\n" +
					"  INSERT INTO log (msg) VALUES (new.msg);\n" +
					"END",
				"CREATE TABLE after_trigger (id INTEGER)",
			},
		},
		{
			// A function that returns a trigger is not a trigger. Its body
			// must not be treated as a trigger body.
			name: "a function that returns a trigger is not a trigger",
			body: "CREATE FUNCTION f() RETURNS trigger AS $$\n" +
				"BEGIN\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n" +
				"CREATE TABLE after_function (id INTEGER);",
			want: []string{
				"CREATE FUNCTION f() RETURNS trigger AS $$\n" +
					"BEGIN\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql",
				"CREATE TABLE after_function (id INTEGER)",
			},
		},
		{
			// A CASE expression inside a trigger body holds an END of its
			// own, which must not close the body too early.
			name: "case expression inside a trigger body",
			body: "CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN\n" +
				"  UPDATE t SET x = CASE WHEN new.a = 1 THEN 2 ELSE 3 END WHERE id = 1;\n" +
				"END;\n" +
				"CREATE TABLE after_case (id INTEGER);",
			want: []string{
				"CREATE TRIGGER t_ai AFTER INSERT ON t BEGIN\n" +
					"  UPDATE t SET x = CASE WHEN new.a = 1 THEN 2 ELSE 3 END WHERE id = 1;\n" +
					"END",
				"CREATE TABLE after_case (id INTEGER)",
			},
		},
		{
			name: "create or replace trigger",
			body: "CREATE OR REPLACE TRIGGER t_ai AFTER INSERT ON t BEGIN\n" +
				"  INSERT INTO log (msg) VALUES (new.msg);\n" +
				"END;\n" +
				"CREATE TABLE after_replace (id INTEGER);",
			want: []string{
				"CREATE OR REPLACE TRIGGER t_ai AFTER INSERT ON t BEGIN\n" +
					"  INSERT INTO log (msg) VALUES (new.msg);\n" +
					"END",
				"CREATE TABLE after_replace (id INTEGER)",
			},
		},
		{
			name: "drop trigger is not a create trigger",
			body: "DROP TRIGGER t_ai;\nCREATE TABLE after_drop (id INTEGER);",
			want: []string{
				"DROP TRIGGER t_ai",
				"CREATE TABLE after_drop (id INTEGER)",
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := splitStatements(tc.body)
			if len(got) != len(tc.want) {
				t.Fatalf("splitStatements returned %d statements, want %d: %q", len(got), len(tc.want), got)
			}
			for i := range tc.want {
				if got[i] != tc.want[i] {
					t.Errorf("statement %d = %q, want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestTheEmbeddedMigrationsSplitIntoSingleStatements(t *testing.T) {
	for _, dialect := range []string{"sqlite", "postgres"} {
		m := NewMigrator(nil, dialect, discardLogger())
		migrations, err := m.load()
		if err != nil {
			t.Fatalf("load %s migrations: %v", dialect, err)
		}
		for _, mig := range migrations {
			for i, stmt := range splitStatements(mig.body) {
				// A statement that opens more than one object means the
				// splitter did not find a boundary it should have found.
				if n := strings.Count(strings.ToUpper(stmt), "CREATE TRIGGER"); n > 1 {
					t.Errorf("%s migration %d, statement %d opens %d triggers:\n%s", dialect, mig.version, i, n, stmt)
				}
				if strings.Count(strings.ToUpper(stmt), "CREATE TABLE") > 1 {
					t.Errorf("%s migration %d, statement %d opens more than one table:\n%s", dialect, mig.version, i, stmt)
				}
			}
		}
	}
}

func TestTheSQLiteTriggersAreSeparateStatements(t *testing.T) {
	m := NewMigrator(nil, "sqlite", discardLogger())
	migrations, err := m.load()
	if err != nil {
		t.Fatalf("load sqlite migrations: %v", err)
	}

	var triggers []string
	for _, mig := range migrations {
		for _, stmt := range splitStatements(mig.body) {
			if strings.HasPrefix(strings.ToUpper(strings.TrimSpace(stmt)), "CREATE TRIGGER") {
				triggers = append(triggers, stmt)
			}
		}
	}
	if len(triggers) != 3 {
		t.Fatalf("the sqlite migrations hold %d trigger statements, want 3: %q", len(triggers), triggers)
	}
	for _, stmt := range triggers {
		if !strings.Contains(stmt, "END") {
			t.Errorf("the trigger statement does not end with an END:\n%s", stmt)
		}
	}
}

func TestLoadRejectsAMalformedMigrationName(t *testing.T) {
	// The migration files are embedded, so the loader cannot be pointed at a
	// directory holding a broken file name. The parsing behaviour is
	// therefore asserted against the real embedded files: every one of them
	// has to parse into a numeric version and a non empty name.
	for _, dialect := range []string{"sqlite", "postgres"} {
		m := NewMigrator(nil, dialect, discardLogger())
		migrations, err := m.load()
		if err != nil {
			t.Fatalf("load %s migrations: %v", dialect, err)
		}
		if len(migrations) == 0 {
			t.Fatalf("no %s migrations were loaded", dialect)
		}

		entries, err := fs.ReadDir(migrationFS, "migrations/"+dialect)
		if err != nil {
			t.Fatalf("read the %s migration directory: %v", dialect, err)
		}
		var files int
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), ".sql") {
				continue
			}
			files++
			// The loader splits "<version>_<name>.sql" on the first
			// underscore and turns the left part into a number, so a file
			// name outside of that shape would be rejected.
			version, name, ok := strings.Cut(strings.TrimSuffix(e.Name(), ".sql"), "_")
			if !ok {
				t.Errorf("%s migration %q has no version separator", dialect, e.Name())
				continue
			}
			if _, err := strconv.Atoi(version); err != nil {
				t.Errorf("%s migration %q has the non numeric version %q", dialect, e.Name(), version)
			}
			if name == "" {
				t.Errorf("%s migration %q has an empty name", dialect, e.Name())
			}
		}
		if files != len(migrations) {
			t.Errorf("%s: loaded %d migrations but the directory holds %d sql files", dialect, len(migrations), files)
		}

		for _, mig := range migrations {
			if mig.version <= 0 {
				t.Errorf("%s migration %q has the non positive version %d", dialect, mig.name, mig.version)
			}
			if mig.name == "" {
				t.Errorf("%s migration %d has an empty name", dialect, mig.version)
			}
			if strings.TrimSpace(mig.body) == "" {
				t.Errorf("%s migration %q has an empty body", dialect, mig.name)
			}
		}
	}

	// A dialect without embedded migrations is reported as an error instead
	// of silently applying nothing.
	unknown := NewMigrator(nil, "mysql", discardLogger())
	if _, err := unknown.load(); err == nil {
		t.Error("load for a dialect without embedded migrations returned no error")
	}
}

func TestMigrationsAreOrderedByVersion(t *testing.T) {
	for _, dialect := range []string{"sqlite", "postgres"} {
		m := NewMigrator(nil, dialect, discardLogger())
		migrations, err := m.load()
		if err != nil {
			t.Fatalf("load %s migrations: %v", dialect, err)
		}
		if len(migrations) == 0 {
			t.Fatalf("no %s migrations were loaded", dialect)
		}

		seen := make(map[int]string, len(migrations))
		for i, mig := range migrations {
			if mig.version <= 0 {
				t.Errorf("%s migration %q has the non positive version %d", dialect, mig.name, mig.version)
			}
			if previous, duplicate := seen[mig.version]; duplicate {
				t.Errorf("%s: version %d is used by %q and %q", dialect, mig.version, previous, mig.name)
			}
			seen[mig.version] = mig.name
			if i > 0 && mig.version <= migrations[i-1].version {
				t.Errorf("%s: version %d does not come after %d", dialect, mig.version, migrations[i-1].version)
			}
		}
	}
}

// TestPostgresMigrationsApply exercises the postgres dialect against a live
// server. It is skipped unless a server URL is provided, because no
// PostgreSQL instance is available in this environment.
func TestPostgresMigrationsApply(t *testing.T) {
	dsn := os.Getenv("WJ_TEST_POSTGRES_URL")
	if dsn == "" {
		t.Skip("PostgreSQL is not available in this environment; set WJ_TEST_POSTGRES_URL to run the postgres dialect tests")
	}

	handle, err := Open(dsn, discardLogger())
	if err != nil {
		t.Fatalf("open postgres database: %v", err)
	}
	t.Cleanup(func() { _ = handle.Close() })

	m := NewMigrator(handle.SQL, "postgres", discardLogger())
	migrations, err := m.load()
	if err != nil {
		t.Fatalf("load postgres migrations: %v", err)
	}
	version, err := m.Up()
	if err != nil {
		t.Fatalf("Up: %v", err)
	}
	if want := migrations[len(migrations)-1].version; version != want {
		t.Errorf("Up returned version %d, want %d", version, want)
	}

	rows := readMigrationRows(t, handle.SQL)
	if len(rows) != len(migrations) {
		t.Errorf("schema_migrations holds %d rows, want %d", len(rows), len(migrations))
	}
}
