-- Initial schema for the personal journal.
-- All timestamps are stored in UTC.

CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      VARCHAR(64)  NOT NULL,
    email         VARCHAR(255) NOT NULL DEFAULT '',
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(16)  NOT NULL DEFAULT 'user',
    disabled      BOOLEAN      NOT NULL DEFAULT 0,
    last_login_at TIMESTAMP,
    created_at    TIMESTAMP    NOT NULL,
    updated_at    TIMESTAMP    NOT NULL,
    deleted_at    TIMESTAMP
);
CREATE UNIQUE INDEX idx_users_username ON users (username) WHERE deleted_at IS NULL;

CREATE TABLE user_settings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER      NOT NULL,
    language     VARCHAR(16)  NOT NULL DEFAULT 'en',
    timezone     VARCHAR(64)  NOT NULL DEFAULT 'UTC',
    theme        VARCHAR(16)  NOT NULL DEFAULT 'system',
    date_format  VARCHAR(32)  NOT NULL DEFAULT 'YYYY-MM-DD',
    ai_enabled   BOOLEAN      NOT NULL DEFAULT 0,
    map_tile_url VARCHAR(512) NOT NULL DEFAULT '',
    created_at   TIMESTAMP    NOT NULL,
    updated_at   TIMESTAMP    NOT NULL,
    deleted_at   TIMESTAMP
);
CREATE UNIQUE INDEX idx_user_settings_user ON user_settings (user_id);

CREATE TABLE folders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER     NOT NULL,
    name       VARCHAR(200) NOT NULL,
    color      VARCHAR(32)  NOT NULL DEFAULT '',
    icon       VARCHAR(64)  NOT NULL DEFAULT '',
    position   INTEGER      NOT NULL DEFAULT 0,
    created_at TIMESTAMP    NOT NULL,
    updated_at TIMESTAMP    NOT NULL,
    deleted_at TIMESTAMP
);
CREATE INDEX idx_folders_user ON folders (user_id, position);

CREATE TABLE tags (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER     NOT NULL,
    name            VARCHAR(120) NOT NULL,
    normalized_name VARCHAR(120) NOT NULL,
    color           VARCHAR(32)  NOT NULL DEFAULT '',
    created_at      TIMESTAMP   NOT NULL,
    updated_at      TIMESTAMP   NOT NULL,
    deleted_at      TIMESTAMP
);
CREATE UNIQUE INDEX idx_tags_user_norm ON tags (user_id, normalized_name);

CREATE TABLE entries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER     NOT NULL,
    folder_id     INTEGER,
    title         VARCHAR(300) NOT NULL DEFAULT '',
    event_time    TIMESTAMP   NOT NULL,
    event_date    VARCHAR(10) NOT NULL,
    timezone      VARCHAR(64) NOT NULL DEFAULT 'UTC',
    document_json TEXT        NOT NULL DEFAULT '',
    drawing_json  TEXT        NOT NULL DEFAULT '',
    plain_text    TEXT        NOT NULL DEFAULT '',
    color         VARCHAR(32) NOT NULL DEFAULT '',
    is_pinned     BOOLEAN     NOT NULL DEFAULT 0,
    word_count    INTEGER     NOT NULL DEFAULT 0,
    revision      INTEGER     NOT NULL DEFAULT 1,
    created_at    TIMESTAMP   NOT NULL,
    updated_at    TIMESTAMP   NOT NULL,
    deleted_at    TIMESTAMP
);
CREATE INDEX idx_entries_user_time   ON entries (user_id, event_time DESC, id DESC);
CREATE INDEX idx_entries_user_date   ON entries (user_id, event_date);
CREATE INDEX idx_entries_user_created ON entries (user_id, created_at DESC);
CREATE INDEX idx_entries_folder      ON entries (folder_id, event_time DESC);
CREATE INDEX idx_entries_pinned      ON entries (user_id, is_pinned, event_time DESC);

CREATE TABLE entry_tags (
    entry_id   INTEGER   NOT NULL,
    tag_id     INTEGER   NOT NULL,
    created_at TIMESTAMP NOT NULL,
    PRIMARY KEY (entry_id, tag_id)
);
CREATE INDEX idx_entry_tags_tag ON entry_tags (tag_id);

CREATE TABLE media_assets (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER     NOT NULL,
    entry_id       INTEGER,
    live_photo_id  INTEGER,
    live_role      VARCHAR(16) NOT NULL DEFAULT 'standalone',
    kind           VARCHAR(24) NOT NULL,
    original_name  VARCHAR(512) NOT NULL DEFAULT '',
    storage_key    VARCHAR(128) NOT NULL,
    stored_path    VARCHAR(512) NOT NULL,
    derived_path   VARCHAR(512) NOT NULL DEFAULT '',
    preview_path   VARCHAR(512) NOT NULL DEFAULT '',
    mime_type      VARCHAR(160) NOT NULL DEFAULT 'application/octet-stream',
    size           BIGINT      NOT NULL DEFAULT 0,
    hash           VARCHAR(64) NOT NULL DEFAULT '',
    width          INTEGER     NOT NULL DEFAULT 0,
    height         INTEGER     NOT NULL DEFAULT 0,
    duration_ms    INTEGER     NOT NULL DEFAULT 0,
    exif_json      TEXT        NOT NULL DEFAULT '',
    gps_lat        REAL,
    gps_lon        REAL,
    location_name  VARCHAR(255) NOT NULL DEFAULT '',
    location_src   VARCHAR(32)  NOT NULL DEFAULT '',
    attached       BOOLEAN     NOT NULL DEFAULT 0,
    created_at     TIMESTAMP   NOT NULL,
    updated_at     TIMESTAMP   NOT NULL,
    deleted_at     TIMESTAMP
);
CREATE UNIQUE INDEX idx_media_storage_key ON media_assets (storage_key);
CREATE INDEX idx_media_user   ON media_assets (user_id, created_at DESC);
CREATE INDEX idx_media_entry  ON media_assets (entry_id);
CREATE INDEX idx_media_live   ON media_assets (live_photo_id);
CREATE INDEX idx_media_hash   ON media_assets (user_id, hash);
CREATE INDEX idx_media_gps    ON media_assets (gps_lat, gps_lon);

CREATE TABLE locations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER     NOT NULL,
    entry_id   INTEGER,
    media_id   INTEGER,
    name       VARCHAR(255) NOT NULL DEFAULT '',
    address    VARCHAR(255) NOT NULL DEFAULT '',
    latitude   REAL        NOT NULL DEFAULT 0,
    longitude  REAL        NOT NULL DEFAULT 0,
    source     VARCHAR(32) NOT NULL DEFAULT 'manual',
    status     VARCHAR(32) NOT NULL DEFAULT 'confirmed',
    created_at TIMESTAMP   NOT NULL,
    updated_at TIMESTAMP   NOT NULL,
    deleted_at TIMESTAMP
);
CREATE INDEX idx_locations_user  ON locations (user_id, created_at DESC);
CREATE INDEX idx_locations_entry ON locations (entry_id);
CREATE INDEX idx_locations_media ON locations (media_id);
CREATE INDEX idx_locations_gps   ON locations (latitude, longitude);

CREATE TABLE sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER      NOT NULL,
    secret_hash VARCHAR(64)  NOT NULL,
    csrf_token  VARCHAR(64)  NOT NULL,
    expires_at  TIMESTAMP    NOT NULL,
    last_seen_at TIMESTAMP   NOT NULL,
    revoked_at  TIMESTAMP,
    user_agent  VARCHAR(512) NOT NULL DEFAULT '',
    ip          VARCHAR(64)  NOT NULL DEFAULT '',
    created_at  TIMESTAMP    NOT NULL,
    updated_at  TIMESTAMP    NOT NULL
);
CREATE INDEX idx_sessions_user   ON sessions (user_id);
CREATE INDEX idx_sessions_secret ON sessions (secret_hash);
CREATE INDEX idx_sessions_expire ON sessions (expires_at);

CREATE TABLE jobs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER     NOT NULL,
    type         VARCHAR(64) NOT NULL,
    target_id    INTEGER     NOT NULL DEFAULT 0,
    status       VARCHAR(16) NOT NULL DEFAULT 'pending',
    attempts     INTEGER     NOT NULL DEFAULT 0,
    max_attempts INTEGER     NOT NULL DEFAULT 3,
    run_after    TIMESTAMP   NOT NULL,
    locked_at    TIMESTAMP,
    locked_by    VARCHAR(64) NOT NULL DEFAULT '',
    payload_json TEXT        NOT NULL DEFAULT '',
    last_error   TEXT        NOT NULL DEFAULT '',
    created_at   TIMESTAMP   NOT NULL,
    updated_at   TIMESTAMP   NOT NULL
);
CREATE INDEX idx_jobs_pending ON jobs (status, run_after);
CREATE INDEX idx_jobs_user    ON jobs (user_id, type);
CREATE INDEX idx_jobs_target  ON jobs (user_id, target_id, type);

CREATE TABLE ai_metadata (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER     NOT NULL,
    entry_id       INTEGER,
    media_id       INTEGER,
    kind           VARCHAR(16) NOT NULL,
    status         VARCHAR(16) NOT NULL DEFAULT 'pending',
    description    TEXT        NOT NULL DEFAULT '',
    summary        TEXT        NOT NULL DEFAULT '',
    keywords       TEXT        NOT NULL DEFAULT '[]',
    suggested_tags TEXT        NOT NULL DEFAULT '[]',
    model          VARCHAR(128) NOT NULL DEFAULT '',
    error          TEXT        NOT NULL DEFAULT '',
    source_hash    VARCHAR(64) NOT NULL DEFAULT '',
    created_at     TIMESTAMP   NOT NULL,
    updated_at     TIMESTAMP   NOT NULL,
    deleted_at     TIMESTAMP
);
CREATE INDEX idx_ai_user  ON ai_metadata (user_id);
CREATE INDEX idx_ai_entry ON ai_metadata (entry_id);
CREATE INDEX idx_ai_media ON ai_metadata (media_id);
CREATE UNIQUE INDEX idx_ai_media_kind ON ai_metadata (media_id, kind);

-- ---------------------------------------------------------------------------
-- Search index
--
-- Three complementary FTS5 tables over a single canonical document table:
--   * search_fts  (trigram)   -> substring search for latin and CJK, 3+ chars
--   * search_cjk  (unicode61) -> CJK unigram/bigram tokens, 1-2 char queries
--   * search_words(unicode61) -> latin word/prefix search, 1-2 char queries
-- FTS5's default tokenizer cannot segment Chinese, so CJK text is expanded
-- into overlapping 1 and 2 character tokens before indexing.
-- ---------------------------------------------------------------------------

CREATE TABLE search_docs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    entry_id   INTEGER NOT NULL,
    media_id   INTEGER,
    kind       TEXT    NOT NULL,
    field      TEXT    NOT NULL,
    text       TEXT    NOT NULL,
    cjk_text   TEXT    NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL
);
CREATE INDEX idx_search_docs_entry ON search_docs (entry_id);
CREATE INDEX idx_search_docs_user  ON search_docs (user_id);

CREATE VIRTUAL TABLE search_fts USING fts5(
    text,
    content='search_docs',
    content_rowid='id',
    tokenize='trigram'
);

CREATE VIRTUAL TABLE search_cjk USING fts5(
    cjk_text,
    content='search_docs',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE VIRTUAL TABLE search_words USING fts5(
    text,
    content='search_docs',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER search_docs_ai AFTER INSERT ON search_docs BEGIN
    INSERT INTO search_fts(rowid, text) VALUES (new.id, new.text);
    INSERT INTO search_cjk(rowid, cjk_text) VALUES (new.id, new.cjk_text);
    INSERT INTO search_words(rowid, text) VALUES (new.id, new.text);
END;

CREATE TRIGGER search_docs_ad AFTER DELETE ON search_docs BEGIN
    INSERT INTO search_fts(search_fts, rowid, text) VALUES('delete', old.id, old.text);
    INSERT INTO search_cjk(search_cjk, rowid, cjk_text) VALUES('delete', old.id, old.cjk_text);
    INSERT INTO search_words(search_words, rowid, text) VALUES('delete', old.id, old.text);
END;

CREATE TRIGGER search_docs_au AFTER UPDATE ON search_docs BEGIN
    INSERT INTO search_fts(search_fts, rowid, text) VALUES('delete', old.id, old.text);
    INSERT INTO search_cjk(search_cjk, rowid, cjk_text) VALUES('delete', old.id, old.cjk_text);
    INSERT INTO search_words(search_words, rowid, text) VALUES('delete', old.id, old.text);
    INSERT INTO search_fts(rowid, text) VALUES (new.id, new.text);
    INSERT INTO search_cjk(rowid, cjk_text) VALUES (new.id, new.cjk_text);
    INSERT INTO search_words(rowid, text) VALUES (new.id, new.text);
END;
