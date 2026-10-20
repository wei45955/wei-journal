# Architecture

## The shape of the system

Wei Journal is a self hosted personal journal. It is a single Go process that serves a JSON API and a single page application that is a static bundle served by nginx.

```
                     ┌──────────────────────────────┐
   browser  ────────▶│  frontend container          │
                     │  nginx: static bundle +      │
                     │  /api reverse proxy          │
                     └──────────────┬───────────────┘
                                    │  http://backend:8080  (internal network)
                     ┌──────────────▼───────────────┐
                     │  backend container            │
                     │  Go 1.27 / Gin                │
                     │  ┌──────────────────────────┐ │
                     │  │ api    handlers + DTOs   │ │
                     │  │ auth   sessions + CSRF   │ │
                     │  │ search FTS index         │ │
                     │  │ jobs   durable queue     │ │
                     │  │ media  storage + thumbs  │ │
                     │  │ ai     provider adapter  │ │
                     │  └──────────────────────────┘ │
                     └───────┬──────────────┬─────────┘
                             │              │
                    ┌────────▼─────┐  ┌─────▼──────────────┐
                    │ /data        │  │ optional           │
                    │  journal.db  │  │ postgres           │
                    │  uploads/    │  │ (compose profile)  │
                    │  derived/    │  └────────────────────┘
                    └──────────────┘
```

The API is never published to the host in the Docker deployment. Only nginx is reachable, and nginx forwards `/api` to the backend over the internal compose network. The database lives on a named volume and never touches the network.

## The backend

```
backend/
  cmd/server/main.go      start up, graceful shutdown, wiring
  internal/
    api/                  HTTP handlers, DTOs, routing
    auth/                 sessions, CSRF, password hashing, login limiter
    bootstrap/            first administrator, expired session purge
    config/               environment configuration and validation
    db/                   connection, dialect handling, migration runner
    httpx/                response envelope, error codes
    indexer/              builds the search documents
    jobs/                 durable job queue
    journal/              document parsing, text extraction, word count
    media/                file storage, thumbnails, image and video probing
    models/               the database entities
    search/               the search service, SQLite FTS5 and PostgreSQL
    ai/                   the model provider abstraction
```

The packages depend on each other in one direction. `api` is the only package that knows about HTTP. `httpx` is a leaf that only knows how to write the response envelope. `db` owns the connection and the migrations. Nothing reaches around another package into the database except through the small service that owns that concern.

### Layers

**`config`** reads the environment once at start up and validates it. A missing or invalid value stops the process with a clear message instead of failing later at request time. `WJ_ADMIN_PASSWORD` shorter than 10 characters is a start up error, not a runtime surprise.

**`db`** opens the connection and runs the migrations. The schema is owned by the SQL migration files, not by the ORM. GORM is used to query, never to create or alter tables, so the schema on disk is exactly the schema in the repository and the two dialects cannot drift apart. The runner keeps a `schema_migrations` table and applies each migration inside a transaction, with a keyword aware splitter that understands that `BEGIN ... END` blocks in a trigger body are not statement boundaries.

**`api`** holds the handlers. Every handler follows the same shape: read the current user from the context, validate the input, load the records the request may touch **scoped by the account id**, do the work in a transaction when more than one table changes, and write a DTO. The DTOs are a separate type from the database models, so the internal columns never leak and the JSON shape stays stable when the schema changes.

**`auth`** owns the session lifecycle. The session cookie carries an opaque id and a secret. Only a SHA-256 hash of the secret is stored, so a database dump does not yield usable sessions. The secret is rotated on every refresh, which invalidates a stolen copy of an old cookie. Passwords are hashed with bcrypt.

**`search`** builds and queries the index. **`indexer`** turns an entry into the text that goes into the index. **`jobs`** runs the work that must not block a request: thumbnails, AI descriptions, summaries, and the collection of orphaned files.

## Data model

| Table | Holds |
| --- | --- |
| `users` | The accounts, the password hash, the role, the disabled flag. |
| `user_settings` | The per account preferences, including the AI consent and the settings of the picture compression. |
| `sessions` | The session id, the hash of the secret, the expiry, the revocation flag. |
| `folders` | The named collections. `folder_id IS NULL` is the default stream. |
| `tags` | The labels, with a normalised name for the uniqueness rule. |
| `entry_tags` | The many to many link between entries and tags. |
| `entries` | The entries, with the document, the drawing, the event time, the revision and the picture that leads the entry. |
| `media_assets` | The uploaded files, their metadata, their location and the live photo pairing. |
| `locations` | The places attached to an entry or to a media asset. |
| `ai_metadata` | The derived descriptions, summaries, keywords and suggested tags. |
| `jobs` | The durable job queue. |
| `search_docs` | The indexed text of every entry, with the sync triggers. |

Every table that belongs to a user carries a `user_id`, and every query filters on it. A record id in a request is never treated as proof of authorisation: the lookup is always `WHERE id = ? AND user_id = ?`. A request for a record of another account answers `404`, not `403`, so the response does not confirm that the record exists.

### Time

An entry has two times.

- `event_time` is the moment the journal entry describes, stored in UTC. The user can move it, for example to file a photo under the day it was taken rather than the day it was imported.
- `event_date` is the calendar day of that moment **in the time zone of the entry**. It is what the day grouping, the calendar and the streaks use.

`timezone` is stored with the entry. Without it a photo taken in Shanghai at 08:00 would land on the previous day in UTC, and the daily view would be wrong for half of the world's users. The `event_date` column is therefore a stored derivative, not a query time zone conversion, so the daily buckets stay stable regardless of the server time zone.

### Documents

The rich text is a Tiptap document stored as JSON, not as HTML. A JSON document is a tree of typed nodes, so it can be validated, walked and re-rendered without trusting any markup. The plain text and the word count are derived from it on every write, which keeps the search index and the statistics in step with the content. Chinese characters count as words, because a word count that reads a Chinese entry as zero words is worse than useless.

The drawing is stored as a list of strokes with their points, widths and colours. It is never flattened to a bitmap, so it can be edited, recoloured and scaled after the fact, and it stays sharp at every zoom level.

The picture that leads an entry in the timeline is stored in `cover_media_id`. It is empty when the first picture of the entry is used, and it never points at a file of another account.

### Concurrency

Every entry carries a `revision`. A write may include the revision it was based on. If the stored revision has moved on, the write is refused with `409 conflict` and the current revision, and the client can merge or retry. This is what protects an autosave from overwriting text that was typed in another tab.

The list endpoints use keyset pagination on `(event_time, id)` rather than `OFFSET`, so paging stays correct and fast while new entries are being written.

## Search

The search has to work in English and in Chinese, and it has to work well enough that people trust it. Three FTS5 tables over one content table, `search_docs`, keep the triggers in sync automatically.

| Table | Tokeniser | Used for |
| --- | --- | --- |
| `search_fts` | `trigram` | Terms of three characters and more. A trigram index matches inside words, so a search for `opher` finds `Christopher`. |
| `search_cjk` | `unicode61` with a unigram and bigram expansion | Chinese. The default FTS5 tokeniser treats a whole run of Han characters as one token, so a two character query would never match. The query is expanded into single and double character tokens and they are combined with AND. |
| `search_words` | `unicode61` | Whole words and prefixes. A one or two character Latin query, which the trigram index cannot serve, falls back to a prefix search here. |

The service picks the table from the shape of the query: a query that contains Han characters goes to the CJK table, a query of three characters or more goes to the trigram and word tables, and a short Latin query goes to the word table alone.

The indexed text is assembled from the title, the plain text of the document, the tag names, the folder name, the media names, the AI image descriptions and keywords, the AI summary and the place names. The index is rebuilt for an entry whenever it changes.

PostgreSQL has a different path: `ILIKE` for the substring match and a `tsvector` with a GIN index for the word match, with `pg_trgm` for the trigram behaviour.

## Media

Uploads arrive as `multipart/form-data`. The client supplied file name and MIME type are untrusted input.

- The type is sniffed from the content, not taken from the header.
- The name is sanitised for display and for the `Content-Disposition` header.
- The file is written under a generated identifier in a directory layout of `<user id>/<key[0:2]>/<key[2:4]>/<key><ext>`, so no two files collide and no path is ever built from client input.
- The path resolution rejects absolute paths and `..` and verifies that the result stays under the storage root.

The uploads directory is never exposed as a static directory. The files are only reachable through `/api/media/:id/file`, `/thumb` and `/preview`, and each of those checks that the caller owns the asset. The URLs are not treated as secrets.

The original is served with `http.ServeContent`, which handles range requests, so a video can be scrubbed without downloading it whole.

Thumbnails and previews are generated by a background job, not during the request, so an upload returns immediately.

### The pictures of a phone

A photograph taken on an iPhone is usually stored in HEIC, a format most desktops cannot read, and it is several megabytes large. The interface therefore redraws the picture in the browser before it is sent: the phone decodes the file it knows, a canvas scales it to the longest side the account asked for and the result leaves as a JPEG every device understands. The settings live on the account, so the choice survives a reload and a new device.

The defaults are a quality of 80 and a longest side of 2048 pixels. That is sharp on the screen the journal is read on, a phone, while the file that travels over a mobile connection stays small. A picture that the browser cannot read is sent as it is, and the server keeps it and serves it with its own type; a file the server cannot decode gets no thumbnail, and the interface shows the original.

Live Photos arrive as a still image plus a motion component. The two are stored as separate assets that share a `live_photo_id` and carry a `live_role` of `still` or `motion`, so they can be edited, replaced and deleted independently while still being one logical item.

## Background work

Some work must not happen inside a request: generating a thumbnail, describing an image, summarising an entry, collecting a deleted file.

The queue is a table in the same database, which means it needs no extra service and it survives a restart. A worker claims a job in a transaction that also marks it as processing, so two workers never take the same job. A failing job is retried with an exponential backoff and a jitter, up to three attempts. On start up, jobs that were in flight when the process died are recovered if they have been stale for more than five minutes.

The AI features are a bonus, never a hard requirement. A model request that fails, times out, or is not configured leaves the entry exactly as it was and only marks the derived metadata as failed. The save of the entry has already happened by then, and it is never rolled back because a model was unavailable.

No text leaves the server unless a provider is configured **and** the account has the AI features turned on. The consent is a per account setting that defaults to off, and the server checks it before every request to the provider.

## The frontend

A React single page application, built with Vite and Tailwind, served as static files.

```
frontend/src/
  components/   the interface, one folder per feature
  hooks/        the data hooks that talk to the API
  i18n/         the English and Simplified Chinese translations
  lib/          the API client and the helpers
  state/        the shared state
  styles/       the stylesheet and the design tokens
```

The editor is Tiptap. The map is Leaflet with marker clustering. The router is React Router. The translations are i18next.

The build produces a bundle with content hashed file names. nginx serves `/assets` with a one year immutable cache header and `index.html` with `no-store`, so a new release never points at files that no longer exist.

## Security

| Concern | How it is handled |
| --- | --- |
| Passwords | bcrypt with the default cost. |
| Sessions | Opaque id and secret, only the hash of the secret is stored, rotated on refresh, revocable server side. |
| CSRF | A double submit token: the `wj_csrf` cookie must match the `X-CSRF-Token` header on every mutating request. |
| Cookies | `HttpOnly` on the session, `SameSite=Lax` on both, `Secure` when the installation is served over HTTPS. |
| Authorisation | Every query is scoped by the account id. A record id is never proof of authorisation. |
| Tenant isolation | There is no endpoint that takes a user id from the request. The only path to the admin role is the first account on an empty installation. |
| Uploads | The type is sniffed, the name is sanitised, the path is generated, the directory is not public, and the download checks the owner. |
| XSS | The document is a JSON tree that is validated and rendered by the editor, never raw HTML. The stored document is sanitised when it is parsed. |
| SQL injection | GORM parameterises the queries. The few raw statements are fixed strings. |
| Secrets | The secrets live in `.env`, which is ignored by git. The settings without a secret live in `config.env`, which is committed, and `.env.example` holds the placeholders. |
| Errors | The client gets a generic message. The cause is written to the server log. |
| Rate limiting | A global limit per client, plus a tighter limit on sign-in attempts. |
| The client address | The `X-Forwarded-For` header is only believed when the request comes from a proxy that is on the trusted list, so a client that reaches the server directly cannot choose the bucket it is counted in. |
| Headers | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` on every response. |
| CORS | Only the origins listed in `WJ_TRUSTED_ORIGINS` are allowed, and only with credentials. |
| Debug mode | The web framework switches to its release mode unless the version is `dev`. The Compose file defaults the version to `1.0.0`. |
| The database | It is never published to the host and never reachable over the network. |

## The two databases

SQLite is the default because it needs no service and a personal journal is not a high write load. The connection uses WAL journalling, a busy timeout and `foreign_keys=ON`, and the pool is capped at four connections, because a larger pool only adds lock contention.

PostgreSQL is available as an alternative. The schema is written for both, the migration runner picks the dialect, and the search has a PostgreSQL implementation.

## Known limitations

- The media processing is done by the standard library. It reads the dimensions of images and videos and writes JPEG and PNG thumbnails, but it does not transcode video.
- The image decoders are the pure Go ones, so HEIC and HEIF files are stored and served but get no thumbnail. The interface shows the original in their place. The same holds for a file whose content is not a known format.
- The search index is rebuilt per entry on write. For a very large archive a nightly full rebuild would be faster than the incremental path.
- The queue runs in the same database as the journal. That is deliberate and simple, but it means a very long job holds a connection.
- The pairing of the two parts of a Live Photo is best effort: it looks at the creation time of the two files, and a pair that was taken far apart is not paired.
- The map needs network access for the tiles. Without it the map shows nothing, and the places are listed below it instead.
