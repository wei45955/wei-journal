# Troubleshooting

Start with the logs.

```bash
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
```

The backend logs one line per request with the method, the path, the status, the duration in milliseconds and the username when the request was authenticated. A 5xx is also written at the error level with the underlying cause, which is the only place the real reason for a failure appears. The client only ever sees a generic message.

## The service does not start

### The process exits immediately

```bash
docker compose logs backend
```

The most common cause is a missing or too short administrator password:

```
admin password must be at least 10 characters
```

The process refuses to start rather than running with a weak default. Set `WJ_ADMIN_PASSWORD` to at least 10 characters, or leave it empty to create the administrator through the interface.

The other start up errors are the same shape: an invalid `WJ_MAX_UPLOAD_MB` below 1, an unreadable data directory, or a database that cannot be opened.

### The Compose file is rejected because `config.env` is missing

`config.env` belongs to the repository, it holds the settings of the installation and it holds no secret. If it is gone, the project was copied without it or it was deleted. Restore it:

```bash
git checkout config.env
```

### A setting in `config.env` has no effect

Three places can decide a value, and the later one wins.

1. The `ENV` lines of `backend/Dockerfile`, which fix the paths inside the container and the listening address.
2. `config.env`, the committed settings.
3. `.env`, the local file. It overrides the same value in `config.env`.

The `environment:` block of `docker-compose.yml` sits above all of them and sets the build version, which has to match the tag of the image.

This means a `WJ_DATA_DIR` in `config.env` or in `.env` **does** move the data out of the volume: the container then writes to that path inside the container, which is not the volume, and the journal comes up empty. Leave `WJ_DATA_DIR` alone unless the volume itself is moved.

To see what a container actually received:

```bash
docker compose exec backend env | sort
```

### The data directory is not writable

The container runs as the unprivileged user `journal` with the uid 10001. The named volume is created with the ownership of the image, so a fresh volume works. A volume that was created by an earlier image, or a bind mount from the host, can have the wrong ownership.

```bash
docker compose exec backend ls -ld /data
```

If it is owned by root, either recreate the volume or change the ownership of the bind mount on the host:

```bash
sudo chown -R 10001:10001 /srv/journal-data
```

The symptom of a bind mount with the wrong ownership is this line in the log:

```
open sqlite: unable to open database file: out of memory (14)
```

It reads like a memory problem but is not one. SQLite reports "out of memory" for several unrelated errors, and this one means that it could not create the database file in the directory. The directory belongs to a different user, so the file cannot be created.

### The database is locked

```
database is locked (5) (SQLITE_BUSY)
```

The connection uses WAL journalling and a busy timeout of 10 seconds, so a lock normally clears on its own. A persistent lock means another process is writing to the same file, for example an old container that was not stopped.

```bash
docker compose ps -a          # is there a second backend container?
docker compose down           # stop everything, then start again
```

Do not delete `journal.db-wal` while the service is running. It holds the most recent writes.

### The migration fails

```
applied migration 2 ... failed
```

The migrations run in a transaction, so a failed migration leaves the schema at the previous version. The error names the migration. The usual causes are a database that was created by an older, incompatible version, or a PostgreSQL database that already holds a conflicting schema.

On PostgreSQL, check that the extension the search needs is available:

```bash
docker compose exec postgres psql -U journal -d journal -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
```

## The interface does not load

### A blank page

The bundle is served from the `frontend` container. Check that it built:

```bash
docker compose logs frontend
docker compose exec frontend ls /usr/share/nginx/html
```

If `index.html` is missing, the frontend build failed. Run it outside Docker, from the root of the repository, to see the error:

```bash
cd frontend && npm ci && npm run build
```

### The assets are 404 after a deployment

`index.html` is served with `no-store` and the assets with a one year immutable cache. If a new release is not picked up, the browser is holding a stale `index.html` and asking for asset files that no longer exist. A hard reload fixes it. If it happens for everyone, check that the `frontend` container was actually rebuilt.

### The interface loads but the API calls fail

Check the API through the frontend, which is how a browser reaches it:

```bash
curl -s http://127.0.0.1:8088/api/health
```

A 502 means nginx cannot reach the backend.

```bash
docker compose exec frontend wget -qO- http://backend:8080/api/health
```

If that works, the problem is in nginx. If it does not, the backend is not healthy:

```bash
docker compose logs backend
```

### A CORS error in the browser console

The API only allows the origins listed in `WJ_TRUSTED_ORIGINS`. Add the exact origin of the interface, including the scheme and the port:

```
WJ_TRUSTED_ORIGINS=https://journal.example.com
```

A trailing slash or a missing scheme does not match.

## Sign-in problems

### "please sign in" although the password is right

The session cookie is not arriving. Check the response headers of the sign-in request for `Set-Cookie: wj_session=...`.

- `Secure` on a plain HTTP origin: the browser drops the cookie. Set `WJ_COOKIE_SECURE=false` for a local installation over HTTP, and `true` behind HTTPS.
- A `Domain` that does not match the host: leave `WJ_COOKIE_DOMAIN` empty for a single hostname.
- The clock is wrong: the session is created with an expiry, and a server whose clock is far in the future issues cookies that are already expired. Check `date` on the host.

### "403 forbidden" on a save, although the session works

The CSRF token is missing or does not match the cookie. The client must send the value of the `wj_csrf` cookie in the `X-CSRF-Token` header on every POST, PATCH and DELETE. The token changes when the session is refreshed, so a client that caches it for too long starts failing.

A page that was open over a long session is a common cause. Reload it.

### "too many sign-in attempts"

The sign-in limiter allows 10 attempts per 15 minutes for a client address and a username. It resets on a successful sign-in.

**Check `WJ_TRUSTED_PROXY`.** The limiter counts per client address, so every client that arrives through the same proxy shares one address and one bucket. That is correct when the proxy sets `X-Forwarded-For` and the server believes it, which is what `WJ_TRUSTED_PROXY=true` does for the nginx container of the Compose deployment. If the proxy runs elsewhere, list it in `WJ_TRUSTED_PROXY_CIDRS`. If the address in the logs is the proxy's own address, the server does not believe the forwarding header yet and the limit applies to the username across all clients. The remedy is to wait 15 minutes or to clear the in-memory limiter by restarting the backend.

```bash
docker compose restart backend
```

The limiter is in memory, so a restart clears it.

### "incorrect username or password" for an account that exists

The password is stored as a bcrypt hash. If the database was restored from a backup of a different installation, the hash does not match. There is no administrator endpoint that resets a password, so use the change password endpoint from a session, or register a new account.

## The AI features do not work

### "no language model provider is configured"

`GET /api/ai/status` says `configured: false`. The provider needs `OPENAI_API_KEY`, and `WJ_AI_ENABLED` must not be `false`. The key is read at start up, so a change needs a restart:

```bash
docker compose up -d --force-recreate backend
```

### "AI processing is turned off for your account"

The per account consent is off. It defaults to off for every new account, so no text leaves the server until the user turns it on in the settings. Turn it on there, or set it with `PATCH /api/settings`.

### The description or the summary stays empty

The work happens in the background queue. Check that the worker is running:

```bash
docker compose logs backend | grep -i worker
```

The queue is a table in the database:

```bash
docker compose exec backend sh -c 'ls -la /data/journal.db'
# use the sqlite3 instructions from the backup document to query it
```

`SELECT type, status, attempts, last_error FROM jobs ORDER BY id DESC LIMIT 20;` shows what happened. A job that failed three times gives up and records the reason in `last_error`.

Queue it again with `POST /api/ai/reprocess` for the entry or the media.

### The provider returns an error

The provider is any OpenAI compatible endpoint. Check `OPENAI_BASE_URL` includes the version path, for example `https://api.openai.com/v1`, and that the model names exist on that endpoint. `OPENAI_VISION_MODEL` must be a model that accepts images.

## Uploads fail

### "413 payload too large"

The file is above `WJ_MAX_UPLOAD_MB`. The proxy in front of the frontend also has a limit, and nginx in the frontend container has `client_max_body_size 512m`. If the application limit is raised above 512 MB, raise the nginx limit in `frontend/nginx.conf` as well, and the limit of the outer proxy.

### "the file is larger than the configured upload limit"

Same cause, reported by the application rather than by the proxy. Check `WJ_MAX_UPLOAD_MB` and restart the backend after changing it.

### The upload is rejected before it reaches the application

A `413` with an HTML body comes from nginx or from the outer proxy, not from the API. An API error has a JSON body with an `error` object.

### The file is uploaded but never appears

The thumbnail is built by a background job. If the original appears and the thumbnail does not, the job failed. Look for `media.thumbnail` in the `jobs` table.

### A Live Photo shows only the still image

A Live Photo needs both parts. The still image alone is a normal image. Upload both with `POST /api/media/live`, or pair two existing assets with `POST /api/media/:id/link`.

## The search finds nothing

### The search is empty for a known term

The index is rebuilt for an entry when it changes. An entry that was written before a restore keeps its index rows, because the rows are in the database. A term that is only in the media descriptions needs the AI features to have been on when the media was uploaded.

Try the terms in different shapes. A Chinese query of one or two characters goes to the CJK index, three or more characters go to the trigram index, and a short Latin query is a prefix search. A query of one or two Latin characters matches only the beginning of a word.

### The search finds the entry but not the Chinese text

Check that the entry body really contains the text. The index holds the plain text that is derived from the document, so text inside an image or an attachment is not in it.

## The map is empty

- The place has to be attached to an entry or a media asset. A place that is only a coordinate in the media metadata does not appear on the map.
- The place search needs `WJ_GEOCODING_ENABLED=true`, and it is off by default because the typed text is sent to a third party. The own places search always works.
- Chinese place names come out much better from the Chinese service. Set `WJ_GEOCODING_PROVIDER=amap` and put a "web service" key in `WJ_AMAP_KEY` in `.env`. The coordinates are converted to the system the journal keeps, so the points on the map stay where they belong.
- A Chinese tile service in the "map tile address" setting of the settings page is recognised, and the points on the map are moved to match it.

## The statistics look wrong

- The streaks count the days that hold at least one entry, derived from the stored data on every request. Deleting an entry changes the result immediately.
- A Live Photo counts once as a photo and once as a video. It is never counted as two photos.
- The word count comes from the plain text of the document. Chinese characters count as words.

## Everything is slow

- The database is SQLite. A single writer serialises the writes, so a large archive with many concurrent writes is slower than PostgreSQL. Switch with the `postgres` profile.
- A reverse proxy that buffers the response makes the media downloads slower. The frontend nginx already sets `proxy_buffering off`.
- Check whether the machine is swapping. The backend holds the file index in memory.

## The data looks wrong after a restore

- The `journal.db-wal` of the old database must be removed, otherwise SQLite replays it into the restored file.
- The `uploads` directory has to be restored with the same layout. The database stores the relative path of every file.
- Check the manifest: `sha256sum -c SHA256SUMS` in the backup directory.

## Collecting more information

The log format can be changed without a rebuild:

```
WJ_LOG_FORMAT=json   # one JSON object per line, for a log system
WJ_LOG_LEVEL=debug   # more detail
```

Restart the backend after changing them.

Note that the log level is also raised to debug whenever `WJ_VERSION` is `dev`, and that the same value switches the web framework into its debug mode, which prints the whole route table on every start. Use a real version such as `1.0.0` in production.

To see what the server actually returns, the API answers with a JSON body in every case, including the errors:

```bash
curl -s -i http://127.0.0.1:8088/api/health
```

A health check that answers `{"data":{"status":"ok",...}}` means the process is up. `/api/health/ready` additionally pings the database and returns `503` with `dialect` missing when the database does not answer.
