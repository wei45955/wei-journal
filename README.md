# Wei Journal

A self hosted personal journal. Rich text entries with a date you can set, drawings, photos, Live Photos, video and files, tags, folders, a place on the map, and a search that works in English and in Chinese. Everything is stored on your own machine.

The interface is built for a phone first and scales up to a desktop. It is meant to be opened for two minutes in the evening, written in, and closed again.

## What it does

**Writing.** A Tiptap editor with headings, lists, quotes, code and highlights. The autosave shows what it is doing, and a save that is based on an outdated version is refused instead of overwriting newer text. Entries can be given any date and time, so a photo taken last Tuesday can be filed under last Tuesday.

**Drawings.** A vector sketch layer. The strokes are stored as structured data, never as a bitmap, so a drawing stays sharp and can be edited after the fact.

**Media.** Images, videos, audio and arbitrary files, with a Live Photo mode that keeps the still image and the motion component together as one item. The thumbnails are generated in the background so an upload returns immediately. The original files are only reachable through an authenticated endpoint.

**Organisation.** Folders for named collections, with an explicit choice when a folder is deleted: move the entries into the default stream, or delete them for good. Tags are many to many, and the same tag written as `Travel`, `travel` or `  travel  ` is the same tag. Unicode names, Chinese included, work.

**Search.** One box across the titles, the bodies, the tags, the folder names, the file names, the places and the AI descriptions. It handles English and Chinese properly, which needs a different tokeniser for each and a trigram index for the middle case.

**The archive.** A calendar of the days that hold entries, statistics, the current and the longest run of days, and a map of the places.

**The AI features are optional.** With a model provider configured, images are described, entries are summarised and tags are suggested. Without one, everything else still works. A model request that fails never fails the save of an entry, and no text leaves the server unless the provider is configured and the account has turned the feature on.

**Several accounts.** Each account has its own entries, folders, tags, files, sessions and settings. The records of one account are never visible to another, and the only way to become an administrator is to be the first account on an empty installation.

**Two languages.** English and Simplified Chinese, switchable per account.

## Running it

The quickest way:

```bash
cp .env.example .env
$EDITOR .env            # set WJ_ADMIN_PASSWORD
docker compose up -d --build
```

The interface is on `http://<host>:8088`. The API is behind it at `/api` and is not published to the host. The database and the files are on a named volume, so the journal survives a container replacement.

The settings that are not secret are already in `config.env`, which is committed and travels with the code. The `.env` file holds the secrets of the machine and the values that differ from it, and it is the only file that has to be recreated when the project moves to another machine.

To create the administrator through the interface instead, leave `WJ_ADMIN_USERNAME` and `WJ_ADMIN_PASSWORD` empty and register the first account. The first account on an empty installation becomes the administrator.

For the full procedure, including the reverse proxy, PostgreSQL and the hardening checklist, see [the deployment guide](docs/DEPLOYMENT.md).

### Without Docker

```bash
cd backend && WJ_DATA_DIR=../data go run ./cmd/server   # the API on :8080
cd frontend && npm ci && npm run dev                     # the interface on :5173
```

## The layout

```
backend/          the Go API
  cmd/server/     the entry point
  internal/       api, auth, jobs, media, search, ai, db, models
frontend/         the React interface
  src/            components, hooks, i18n, lib, state, styles
docs/             the documentation
docker-compose.yml
Makefile
```

## The documentation

| Document | What is in it |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) | How the pieces fit together, the data model, the search design, the security model, the known limitations. |
| [API reference](docs/API.md) | Every endpoint, the request and response shapes, the error codes, the authentication rules. |
| [Deployment](docs/DEPLOYMENT.md) | The Docker deployment, the configuration, the first administrator, the reverse proxy, PostgreSQL, the hardening checklist. |
| [Backup and restore](docs/BACKUP.md) | How to back up and restore the database and the files, and what not to do. |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | The symptoms, the causes and the fixes. |

## The configuration

Everything is read from the environment, in two files.

| File | Committed | Holds |
| --- | --- | --- |
| `config.env` | yes | The settings of the installation: the session lifetimes, the limits, the model names, the logging. It holds no secret, so it travels with the code and the installation behaves the same on every machine. |
| `.env` | no | The secrets and the values of this machine: the administrator password, the model key, the database password, the host port. A value here overrides the same value in `config.env`. |

`.env.example` is the template of the second file. The ones that matter in production:

| Variable | Default | Meaning |
| --- | --- | --- |
| `WJ_ADMIN_USERNAME` | — | The name of the first administrator. Only used when the database is empty. |
| `WJ_ADMIN_PASSWORD` | — | The password of the first administrator. At least 10 characters. |
| `WJ_COOKIE_SECURE` | `false` | Set it to `true` behind HTTPS. |
| `WJ_ALLOW_REGISTRATION` | `true` | Set it to `false` once the accounts exist. |
| `WJ_TRUSTED_ORIGINS` | — | The origins allowed to call the API with credentials. |
| `WJ_TRUSTED_PROXY` | `false` | Believe the `X-Forwarded-For` header of a proxy on the loopback or the private container bridge. |
| `WJ_TRUSTED_PROXY_CIDRS` | — | The exact proxy addresses and ranges to believe, when the proxy is elsewhere. |
| `WJ_DATA_DIR` | `./data` | The directory with the database, the uploads and the derived assets. |
| `WJ_DATABASE_URL` | `sqlite://<data dir>/journal.db` | The database. `postgres://...` also works. |
| `WJ_MAX_UPLOAD_MB` | `256` | The size limit of a single upload. |
| `WJ_SESSION_TTL` | `168h` | How long an unused session lasts before it has to be renewed. Use slides the deadline forward. |
| `OPENAI_API_KEY` | — | The key of the model provider. Optional. |
| `WJ_AI_ENABLED` | `true` | The server side switch of the AI features. |
| `WJ_VERSION` | `dev` | The build version. Not `dev` in production, that turns the debug mode on. |
| `WJ_LOG_FORMAT` | `text` | `json` when the logs are collected by a system. |

The full list is in `config.env` and in `.env.example`. The defaults in the table are the ones built into the application; `config.env` changes some of them, and the Compose file sets the paths inside the container and the build version.

## The stack

- **Backend** — Go 1.27, Gin, GORM over a hand written migration runner. SQLite through a pure Go driver, so the image builds without a C toolchain, or PostgreSQL.
- **Frontend** — React 19, TypeScript, Vite, Tailwind, Tiptap, Leaflet with marker clustering, i18next.
- **Tests** — `go test` for the API, the queue, the media handling and the search, and Vitest for the parts of the interface that carry the sharp edges: the link allow list, the drawing geometry, the filters, the API client, the parity of the two translation files and a boot test that renders the whole application.
- **Deployment** — Docker Compose. The frontend is nginx serving a static bundle and proxying the API.

## Development

```bash
make dev-backend    # the API with reload on :8080
make dev-frontend   # the interface on :5173
make test           # the backend and the frontend test suites
make lint           # go vet
make help           # everything else
```

## The security model in one paragraph

Passwords are hashed with bcrypt. A session is an opaque id plus a secret of which only the hash is stored, rotated on every refresh and revocable server side. Every mutating request needs a double submit CSRF token. Every query is scoped by the account id, and a record id in a request is never treated as proof of authorisation. Uploads are sniffed, sanitised and stored under a generated identifier, and the uploads directory is never served as a static directory. There is no endpoint that can grant the admin role, and the database is never reachable over the network.

## The limitations

- The `WJ_TRUSTED_PROXY` setting decides which peers may set the client address with an `X-Forwarded-For` header. It trusts the loopback interface and the private container bridge, and `WJ_TRUSTED_PROXY_CIDRS` narrows that to an explicit list. A proxy on another machine has to be listed.
- Video is not transcoded. The original is stored and served as it is.
- HEIC and HEIF photos are stored and served, but the pure Go decoders cannot read them, so they get no thumbnail and the interface shows the original.
- A thumbnail is built once, right after the upload. There is no endpoint that rebuilds it for an existing asset, so a lost `derived` directory means the affected images show their original until they are uploaded again.
- The search index is rebuilt per entry on write. A very large archive would be faster with a nightly full rebuild.
