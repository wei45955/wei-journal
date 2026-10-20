# Backup and restore

A Wei Journal installation consists of three things on the `journal-data` volume:

| Path | Holds |
| --- | --- |
| `/data/journal.db` | The database: entries, folders, tags, sessions, the job queue, the search index. |
| `/data/uploads/` | The uploaded originals, one directory per account. |
| `/data/derived/` | The generated thumbnails and previews. |

The database and the files must be backed up **together**. The database holds the metadata of the uploads, and the uploads hold the content the metadata points at.

The derived thumbnails can be left out of a backup, but be aware of the consequence: a thumbnail is built once, right after the upload, and there is currently no endpoint that rebuilds it for an existing asset. If the `derived` directory is lost, the affected images keep showing their original instead of a thumbnail until they are uploaded again. If that matters to you, back the directory up as well.

## What not to do

**Never copy `journal.db` with `cp` while the service is running.** The database runs in WAL mode, so the live data is spread across `journal.db`, `journal.db-wal` and `journal.db-shm`. A copy of `journal.db` alone can be missing the most recent writes, and it can be inconsistent.

**Never copy the whole volume directory while the service is running** for the same reason. Stop the service first, or use the method below.

**Never put a backup inside the volume.** A backup that lives in the same directory it protects is not a backup.

## Backing up the database

The safe way is the SQLite backup API, which produces a consistent copy while the service keeps running. It is available through the `sqlite3` command line tool.

### From inside the container

```bash
docker compose exec backend sh -c \
  'sqlite3 /data/journal.db ".backup '"'"'/data/backup.db'"'"'"'
```

The runtime image carries the `sqlite3` command line tool, so this works as it is. Copy the result out with `docker compose cp backend:/data/backup.db ./backups/`.

### With a `sqlite3` on the host

Find the path of the volume and use the backup API against it:

```bash
VOLUME=$(docker volume inspect wei-journal_journal-data --format '{{ .Mountpoint }}')
mkdir -p backups
sqlite3 "$VOLUME/journal.db" ".backup 'backups/journal-$(date +%Y%m%d-%H%M%S).db'"
```

### With a throwaway container

```bash
docker run --rm -v wei-journal_journal-data:/data -v "$PWD/backups:/backups" \
  alpine:3.21 sh -c \
  'apk add --no-cache sqlite && sqlite3 /data/journal.db ".backup '"'"'/backups/journal-$(date +%Y%m%d-%H%M%S).db'"'"'"'
```

### With the Makefile

```bash
make backup
```

It writes to `backups/journal-<timestamp>.db` and refuses to run if `sqlite3` is not installed, rather than producing a copy that looks valid but is not.

### With `VACUUM INTO`

The same result with a different command, useful when the backup API is not available:

```bash
sqlite3 "$VOLUME/journal.db" "VACUUM INTO '/absolute/path/backup.db'"
```

`VACUUM INTO` needs an absolute path and the target must not exist.

## Backing up the files

The uploads are plain files and can be copied any time, but copy them **while the service is stopped** so that a file that is being written at that moment is not captured half finished. The metadata is in the database, so a file that is missing from the copy is not a problem as long as the database is consistent; a file that is half written is a problem if it is the copy that is later restored.

```bash
docker compose stop backend
VOLUME=$(docker volume inspect wei-journal_journal-data --format '{{ .Mountpoint }}')
tar -czf "backups/uploads-$(date +%Y%m%d-%H%M%S).tar.gz" -C "$VOLUME" uploads
docker compose start backend
```

A crash during the copy leaves a truncated file. The application tolerates a missing or unreadable file, it shows the asset as unavailable, but it is better to avoid it.

## A complete backup

```bash
#!/bin/sh
set -e
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="backups/$STAMP"
mkdir -p "$OUT"

VOLUME=$(docker volume inspect wei-journal_journal-data --format '{{ .Mountpoint }}')

# 1. the database, consistently
sqlite3 "$VOLUME/journal.db" ".backup '$OUT/journal.db'"

# 2. the uploaded originals and the generated thumbnails, with the service stopped
docker compose stop backend
tar -czf "$OUT/uploads.tar.gz" -C "$VOLUME" uploads
tar -czf "$OUT/derived.tar.gz" -C "$VOLUME" derived
docker compose start backend

# 3. a manifest
sha256sum "$OUT/journal.db" "$OUT/uploads.tar.gz" "$OUT/derived.tar.gz" > "$OUT/SHA256SUMS"

echo "backup written to $OUT"
```

The `derived.tar.gz` is optional. It only holds the generated thumbnails and previews.

## Restoring

### The database

```bash
docker compose stop backend

VOLUME=$(docker volume inspect wei-journal_journal-data --format '{{ .Mountpoint }}')
cp "$OUT/journal.db" "$VOLUME/journal.db"
# The write ahead log of the old database must not be applied to the new file.
rm -f "$VOLUME/journal.db-wal" "$VOLUME/journal.db-shm"

docker compose start backend
docker compose logs -f backend
```

Removing the `-wal` and `-shm` files matters. If the old write ahead log is left in place, SQLite tries to replay it into the restored file and the database can end up inconsistent.

With the Makefile:

```bash
make restore BACKUP_FILE=backups/<timestamp>/journal.db
```

It asks for a confirmation and refuses to run if the file does not exist.

### The files

```bash
docker compose stop backend
VOLUME=$(docker volume inspect wei-journal_journal-data --format '{{ .Mountpoint }}')
tar -xzf "$OUT/uploads.tar.gz" -C "$VOLUME"
docker compose start backend
```

The directory layout is `<user id>/<key[0:2]>/<key[2:4]>/<key><ext>`. It must be restored exactly, because the database stores the relative path of each file.

### After a restore

The migrations run at the start up and are recorded in `schema_migrations`. A restored database carries its own migration state, so nothing is applied twice. If the restored file is older than the current image, the newer migrations are applied to it.

The search index is part of the database and comes back with it, so the search results are correct immediately after a restore. The index rows are maintained by triggers on `search_docs`, so they cannot drift away from the entries.

## Verifying a backup

```bash
sqlite3 backups/<timestamp>/journal.db "PRAGMA integrity_check;"
# integrity_check

sqlite3 backups/<timestamp>/journal.db "SELECT COUNT(*) FROM entries;"
```

A backup that has not been restored at least once is not a backup.

## Automating it

A daily cron job on the host:

```cron
0 3 * * * /opt/wei-journal/backup.sh >> /var/log/wei-journal-backup.log 2>&1
```

Keep at least a week of daily copies and a month of weekly ones, and keep one copy on a different machine or a different storage system. A backup on the same disk as the original does not survive a disk failure.

## Migrating to another machine

1. Take a backup on the old machine.
2. Copy the backup directory and the uploads archive to the new machine.
3. Install Docker and the repository on the new machine. The settings come with the repository in `config.env`; the secrets have to be entered again in a new `.env`, because they are not in the repository.
4. Start the stack once, let it create the volume, then stop it.
5. Restore the database and the files as described above.
6. Start the stack and check `/api/health/ready` and the interface.

The sessions in the restored database still carry their cookies, so a user who was signed in stays signed in as long as the cookie domain did not change. If the hostname changed, everyone has to sign in again, which is harmless.
