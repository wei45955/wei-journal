package db

import (
	"database/sql"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Handle bundles the SQL and ORM handles plus the resolved dialect.
type Handle struct {
	SQL     *sql.DB
	ORM     *gorm.DB
	Dialect string
}

// Open connects to the configured database, applies pragmas and runs any
// pending migrations.
func Open(databaseURL string, log *slog.Logger) (*Handle, error) {
	gormCfg := &gorm.Config{
		Logger:                 logger.Default.LogMode(logger.Silent),
		SkipDefaultTransaction: true,
		NowFunc:                func() time.Time { return time.Now().UTC() },
	}

	var (
		orm     *gorm.DB
		err     error
		dialect string
	)

	switch {
	case strings.HasPrefix(databaseURL, "sqlite://"):
		dialect = "sqlite"
		path := strings.TrimPrefix(databaseURL, "sqlite://")
		path = strings.TrimPrefix(path, "//")
		if path == "" || path == ":memory:" {
			path = ":memory:"
		} else if dir := filepath.Dir(path); dir != "" && dir != "." {
			if err := os.MkdirAll(dir, 0o750); err != nil {
				return nil, fmt.Errorf("create database directory: %w", err)
			}
		}
		dsn := sqliteDSN(path)
		orm, err = gorm.Open(sqlite.Open(dsn), gormCfg)
		if err != nil {
			return nil, fmt.Errorf("open sqlite: %w", err)
		}
	case strings.HasPrefix(databaseURL, "postgres://"), strings.HasPrefix(databaseURL, "postgresql://"):
		dialect = "postgres"
		orm, err = gorm.Open(postgres.Open(databaseURL), gormCfg)
		if err != nil {
			return nil, fmt.Errorf("open postgres: %w", err)
		}
	default:
		return nil, fmt.Errorf("unsupported database url %q", redactDSN(databaseURL))
	}

	sqlDB, err := orm.DB()
	if err != nil {
		return nil, fmt.Errorf("obtain sql handle: %w", err)
	}
	sqlDB.SetMaxOpenConns(10)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(time.Hour)

	if dialect == "sqlite" {
		// A single writer avoids SQLITE_BUSY under concurrent background jobs.
		sqlDB.SetMaxOpenConns(4)
		for _, pragma := range []string{
			"PRAGMA journal_mode=WAL",
			"PRAGMA busy_timeout=10000",
			"PRAGMA foreign_keys=ON",
			"PRAGMA synchronous=NORMAL",
		} {
			if _, err := sqlDB.Exec(pragma); err != nil {
				return nil, fmt.Errorf("%s: %w", pragma, err)
			}
		}
	}

	migrator := NewMigrator(sqlDB, dialect, log)
	version, err := migrator.Up()
	if err != nil {
		return nil, err
	}
	log.Info("database ready", "dialect", dialect, "schemaVersion", version)

	return &Handle{SQL: sqlDB, ORM: orm, Dialect: dialect}, nil
}

// sqliteDSN builds a modernc compatible SQLite DSN with the pragmas the
// application relies on.
func sqliteDSN(path string) string {
	if path == ":memory:" {
		return "file::memory:?cache=shared&_pragma=busy_timeout(10000)&_pragma=foreign_keys(1)"
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	q := url.Values{}
	q.Add("_pragma", "busy_timeout(10000)")
	q.Add("_pragma", "foreign_keys(1)")
	q.Add("_pragma", "journal_mode(WAL)")
	q.Add("_pragma", "synchronous(NORMAL)")
	q.Add("_txlock", "immediate")
	return "file:" + abs + "?" + q.Encode()
}

// DB returns the ORM handle.
func (h *Handle) DB() *gorm.DB { return h.ORM }

// Close releases the database handles.
func (h *Handle) Close() error {
	if h == nil || h.SQL == nil {
		return nil
	}
	return h.SQL.Close()
}

func redactDSN(dsn string) string {
	if i := strings.Index(dsn, "@"); i > 0 {
		return "***" + dsn[i:]
	}
	return dsn
}
