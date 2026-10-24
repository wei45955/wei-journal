# API reference

Every endpoint lives under `/api`. The API speaks one JSON dialect.

## Conventions

### Response envelope

Successful responses:

```json
{ "data": { "...": "..." } }
```

Paginated responses add a `meta` object:

```json
{
  "data": [],
  "meta": { "nextCursor": "eyJ0IjoxNz...", "hasMore": true, "limit": 30 }
}
```

Errors:

```json
{
  "error": {
    "code": "validation_error",
    "message": "please check the highlighted fields",
    "details": { "username": "3-64 characters, letters, digits, dot, dash or underscore" }
  }
}
```

`details` is optional and maps a field name to a human readable reason. `message` is always safe to show to a user; internal errors never leak a stack trace or a database message.

### Error codes

| Code | HTTP status | Meaning |
| --- | --- | --- |
| `validation_error` | 400 | The request body or a query parameter is wrong. |
| `unauthorized` | 401 | No session, the session expired, or the credentials are wrong. |
| `forbidden` | 403 | Authenticated but not allowed, or a CSRF token is missing or wrong. |
| `not_found` | 404 | The record does not exist **or** belongs to another user. |
| `conflict` | 409 | A uniqueness rule was violated, or the entry was changed elsewhere. |
| `rate_limited` | 429 | Too many requests. |
| `unavailable` | 503 | A feature is not configured on this server. |
| `payload_too_large` | 413 | The upload exceeds `WJ_MAX_UPLOAD_MB`. |
| `internal_error` | 500 | A server side failure. The cause is written to the server log only. |

### Authentication

Session cookies are set by the API:

- `wj_session` — the session identifier, `HttpOnly`, `SameSite=Lax`, `Secure` when `WJ_COOKIE_SECURE=true`.
- `wj_csrf` — the CSRF token, readable by JavaScript, `SameSite=Lax`.

The session cookie value is `"<sessionId>.<secret>"`. Only a SHA-256 hash of the secret is stored, so a database leak does not hand out live sessions. Sessions can be revoked server side, and the secret is rotated on every refresh.

All endpoints except `/api/health`, `/api/health/ready` and the three unauthenticated auth endpoints require the session cookie. **Every mutating request (POST, PATCH, DELETE, PUT) must also send the CSRF token** in the `X-CSRF-Token` header or in a `csrfToken` form field. A missing or wrong token produces `403 forbidden`.

A cross-origin client must therefore be listed in `WJ_TRUSTED_ORIGINS`, and the browser must send the cookies with `credentials: "include"`.

### Pagination

The entry list uses keyset pagination on `(event_time, id)`, so the order stays stable while new entries are written.

- `limit` — 1 to 100, default 30.
- `cursor` — the `meta.nextCursor` value of the previous page. Omit it for the first page.
- `order` — `desc` (default, newest first) or `asc` (oldest first).

Search uses `limit` and `offset` instead.

---

## System

### `GET /api/health`

Liveness probe. Never touches the database.

```json
{ "data": { "status": "ok", "time": "2026-01-01T12:00:00Z", "version": "1.0.0" } }
```

### `GET /api/health/ready`

Readiness probe. Pings the database and returns `503 unavailable` when it does not answer.

```json
{ "data": { "status": "ready", "version": "1.0.0", "dialect": "sqlite" } }
```

`dialect` is `sqlite` or `postgres`.

### `GET /api/export`

The whole archive of the signed in account as one JSON document. Requires authentication.

| Query | Meaning |
| --- | --- |
| `includeMedia` | `true` adds a `url` field to every media item. |

```json
{
  "data": {
    "formatVersion": 1,
    "exportedAt": "2026-01-01T12:00:00Z",
    "includeMedia": true,
    "folders": [],
    "tags": [],
    "entries": []
  }
}
```

The export is scoped to the caller. It never contains another account's data.

---

## Authentication

### `POST /api/auth/register`

Creates an account. Disabled with `403 forbidden` when `WJ_ALLOW_REGISTRATION=false`.

```json
{ "username": "wei", "email": "wei@example.com", "password": "a-long-password" }
```

Validation: username `^[A-Za-z0-9._-]{3,64}$`, a syntactically valid email when given, password between 8 and 72 characters.

The **first account registered on an empty installation becomes an administrator**. This is the only path that can grant the admin role, and it requires the account count to be zero.

Response `201`:

```json
{ "data": { "user": { "...": "..." }, "csrfToken": "..." } }
```

The session cookie is set by the response.

### `POST /api/auth/login`

```json
{ "username": "wei", "password": "a-long-password" }
```

Response `200` with `user` and `csrfToken`. An unknown user still runs a password verification so the response time does not reveal whether the account exists. Repeated failures are limited to 10 attempts per 15 minutes per client IP and username, returning `429 rate_limited`.

### `POST /api/auth/refresh`

Rotates the session secret and extends its life. Returns the new CSRF token.

```json
{ "data": { "csrfToken": "...", "expiresAt": "2026-01-02T12:00:00Z" } }
```

### `POST /api/auth/logout`

Revokes the current session server side and clears the cookies. Returns `204`.

### `GET /api/auth/me`

The signed in account, its settings and the current CSRF token.

### `POST /api/auth/password`

```json
{ "currentPassword": "...", "newPassword": "..." }
```

The current password must be correct. On success every other session of that account is revoked, so a stolen session is closed immediately.

### `GET /api/auth/sessions`

The active sessions of the account: id, user agent, IP, creation time, last activity and expiry. The current session is marked with `current: true`.

### `DELETE /api/auth/sessions/:id`

Revokes one session. The current session cannot be revoked this way, use `POST /api/auth/logout` for that.

---

## Entries

### `GET /api/entries`

The timeline. All filters are optional and combine with AND.

| Query | Meaning |
| --- | --- |
| `folderId` | A numeric folder id, or `none` for the default stream. |
| `tags` | Comma separated tag ids, for example `3,7`. |
| `tagMode` | `any` (default) or `all`. `all` requires every listed tag. |
| `from` | Inclusive lower bound on the event date, `YYYY-MM-DD`. |
| `to` | Inclusive upper bound on the event date, `YYYY-MM-DD`. |
| `mediaType` | `image`, `video`, `audio`, `file` or `livephoto`. |
| `pinned` | `true` selects the pinned entries only. |
| `q` | Free text search across title, body, tags and media names. |
| `limit` | 1 to 100, default 30. |
| `order` | `desc` (default) or `asc`. |
| `cursor` | The cursor of the previous page. |

Response `200` with `data` = array of entry objects and `meta` = `{nextCursor, hasMore, limit}`.

### `POST /api/entries`

Creates an entry. Returns `201` with the entry object.

```json
{
  "title": "A walk in the rain",
  "document": "{\"type\":\"doc\",\"content\":[]}",
  "drawing": "[]",
  "eventTime": "2026-01-01T09:30:00Z",
  "timezone": "Europe/Berlin",
  "folderId": 2,
  "tagIds": [1, 4],
  "tagNames": ["rain"],
  "color": "#f5c542",
  "isPinned": false,
  "mediaIds": [10, 11],
  "coverMediaId": 10
}
```

- `document` is a Tiptap document **serialised as a JSON string**. The response returns it as a JSON object, so the client serialises on the way out and parses on the way in. It is parsed, not trusted, and the plain text and word count are derived from it. Malformed input degrades to an empty document instead of failing the save.
- `drawing` is a JSON string holding the stroke list, in the same way.
- `eventTime` must be RFC 3339. It is stored in UTC; `eventDate` is derived from it in `timezone` so the day of the event stays the day the user lived, not the day of the server.
- `folderId` is validated against the account. `null` means the default stream.
- `tagIds` and `tagNames` can be combined. Names that do not exist yet are created.
- `mediaIds` attaches previously uploaded assets.
- `coverMediaId` names the picture that leads the entry in the timeline when it carries several. It must belong to the account; `null` clears the choice.
- `drawing` is the vector stroke list, stored as structured data and never flattened to a bitmap.

### `GET /api/entries/:id`

One entry with its tags, media, location and AI metadata. `404` when it does not exist or belongs to another account.

### `PATCH /api/entries/:id`

Updates an entry. The body has the same shape as the create body. Only the fields that are present are changed.

When `revision` is included and does not match the stored revision, the write is refused with `409 conflict` and `details.currentRevision` holding the current value. This is the stale-save protection: the client sends the revision it loaded, and a write that is based on an outdated version is rejected instead of overwriting newer content.

On success the revision is incremented.

### `DELETE /api/entries/:id`

Deletes the entry, its tag links, its location, its AI metadata and its search index rows. The uploaded files are collected by a background job. Returns `204`.

### `POST /api/entries/:id/location`

Attaches a place to the entry. The previous location of the entry is replaced.

```json
{ "latitude": 52.52, "longitude": 13.405, "name": "Berlin", "address": "Unter den Linden" }
```

Latitude must be between -90 and 90, longitude between -180 and 180.

### `DELETE /api/entries/:id/location`

Removes the place of the entry.

---

## Folders

### `GET /api/folders`

The folders of the account, ordered by position, each with `entryCount`.

### `POST /api/folders`

```json
{ "name": "Travel", "color": "#4a90d9", "icon": "plane" }
```

Returns `201`.

### `PATCH /api/folders/:id`

Same body shape as the create.

### `DELETE /api/folders/:id`

The delete strategy is chosen with a query parameter.

| Query | Behaviour |
| --- | --- |
| `strategy=default` | The default. The entries move into the permanent default stream, the folder is removed. |
| `strategy=delete` | The folder **and** its entries are permanently deleted. Requires `confirm=true`, otherwise `400 validation_error`. |

### `POST /api/folders/reorder`

```json
{ "folderIds": [3, 1, 2] }
```

The order of the array is the new order. The ids must belong to the account; unknown ids are ignored.

---

## Tags

Tags are case and whitespace insensitive. `  Travel ` and `travel` are the same tag, and the first spelling that was created is kept as the display name. Unicode names including Chinese are supported.

### `GET /api/tags`

The tags of the account with their entry counts. `?q=` filters by substring.

### `POST /api/tags`

```json
{ "name": "travel", "color": "#4a90d9" }
```

A duplicate name returns `409 conflict`. At most 120 characters.

### `PATCH /api/folders/:id` → `PATCH /api/tags/:id`

```json
{ "name": "travel", "color": "#4a90d9" }
```

### `DELETE /api/tags/:id`

Removes the tag and its links to entries. The entries themselves are kept.

---

## Media

Uploads are `multipart/form-data`. The file name and the MIME type from the client are treated as untrusted input: the type is sniffed from the content, the name is sanitised for display only, and the file is stored under a generated server side identifier. The uploads directory is never served as a static directory, and every file is only reachable through the authenticated endpoints below, which check the owner of the asset.

### `POST /api/media`

Uploads one or more files. The field is `files` (repeatable) or `file`.

```bash
curl -X POST https://journal.example.com/api/media \
  -H "X-CSRF-Token: $TOKEN" \
  -F "files=@photo.jpg" -F "files=@clip.mov"
```

Returns `201` with an array of media objects. A file above `WJ_MAX_UPLOAD_MB` returns `413 payload_too_large` with `details.limitMB` holding the limit, so the interface can say what the limit is.

The interface redraws the pictures in the browser before they are sent, so a photograph taken on a phone arrives as a JPEG every device can read. A HEIC file that reaches the server is kept as it is and served with its own type; the server makes a thumbnail only for the formats it can decode.

### `POST /api/media/live`

Uploads a Live Photo as one logical item. The field `still` holds the still image and the field `motion` holds the motion component.

Returns `201`:

```json
{ "data": { "livePhotoId": 12, "still": { "...": "..." }, "motion": { "...": "..." } } }
```

### `GET /api/media`

The uploaded assets of the account, newest first, at most 200.

| Query | Meaning |
| --- | --- |
| `entryId` | Only the assets attached to that entry. |
| `kind` | `image`, `video`, `audio`, `file`, `document`, `livephoto_still`, `livephoto_motion`. |

### `GET /api/media/:id`

The metadata of one asset.

### `PATCH /api/media/:id`

```json
{
  "originalName": "sunset.jpg",
  "entryId": 4,
  "latitude": 52.52,
  "longitude": 13.405,
  "locationName": "Berlin",
  "detach": false,
  "liveRole": "still"
}
```

`detach: true` removes the asset from its entry without deleting the file.

### `DELETE /api/media/:id`

Marks the asset as deleted and removes the file. The file collection runs in the background. Returns `204`.

### `POST /api/media/:id/link`

Pairs a still image and a motion component that were uploaded separately into one Live Photo.

```json
{ "motionId": 21 }
```

### `GET /api/media/:id/file`

The original file. The response supports range requests, so video can be scrubbed in the browser.

### `GET /api/media/:id/thumb`

The thumbnail.

### `GET /api/media/:id/preview`

The larger preview image.

All three require the caller to own the asset. The URLs are not a secret and are not a security boundary on their own.

---

## Search, calendar and statistics

### `GET /api/search`

| Query | Meaning |
| --- | --- |
| `q` | The search term. Required. |
| `limit` | 1 to 100, default 30. |
| `offset` | The offset for paging. |
| `type` | Restrict the hits to one kind, for example `entry` or `media`. |
| `from` | Inclusive lower bound on the event date. |
| `to` | Inclusive upper bound on the event date. |

Response `200`:

```json
{
  "data": [
    {
      "entry": { "...": "..." },
      "matches": [
        { "entryId": 4, "mediaId": null, "kind": "entry", "field": "text", "score": 1.0, "snippet": "..." }
      ]
    }
  ],
  "meta": { "limit": 30, "hasMore": false }
}
```

The search covers English and Chinese. The index is built from the title, the plain text of the document, the tag names, the folder name, the media names, the AI image descriptions and keywords, and the place names. Short Chinese queries are expanded into single and double character tokens, because the default FTS tokenizer cannot segment Chinese.

### `GET /api/calendar`

| Query | Meaning |
| --- | --- |
| `view` | `day`, `month` (default) or `year`. |
| `date` | The anchor date, `YYYY-MM-DD`. Defaults to today. |

```json
{ "data": { "view": "month", "start": "2026-01-01", "end": "2026-01-31", "total": 12, "days": [ { "date": "2026-01-03", "count": 2 } ] } }
```

### `GET /api/stats`

```json
{
  "data": {
    "totalEntries": 128, "totalPhotos": 64, "totalVideos": 12,
    "totalAudios": 1, "totalFiles": 3, "totalWords": 24500,
    "activeDays": 90, "currentStreak": 4, "longestStreak": 21,
    "firstEntryDate": "2025-03-01", "lastEntryDate": "2026-01-20",
    "entriesThisYear": 46, "currentYear": 2026
  }
}
```

The streaks are derived from the stored dates on every call, so deleting an entry changes the result. A Live Photo counts once as a photo and once as a video, never as two photos.

---

## Locations

### `GET /api/locations`

The places of the account for the map, at most 1000.

| Query | Meaning |
| --- | --- |
| `from`, `to` | Filter on the creation time. |
| `folderId` | A folder id or `none` for the default stream. |
| `tags` | Comma separated tag ids. |
| `entryId` | Only the place of that entry. |

### `GET /api/locations/search`

Place name search. Disabled with `503 unavailable` unless `WJ_GEOCODING_ENABLED=true`, because the query is sent to a third party service.

The service is chosen by `WJ_GEOCODING_PROVIDER`: `nominatim` (the default, no key) or `amap` (the Chinese service, which needs `WJ_AMAP_KEY`). The answer is the same either way, and the coordinates are always WGS-84, whatever the service speaks.

| Query | Meaning |
| --- | --- |
| `q` | The place name. Required. |

### `GET /api/locations/own`

The user's own places as suggestions. Works without any external service.

### GET /api/locations/capabilities

What this installation can do: { search: true } when the place search is configured, { search: false } when it is not. The interface uses it to say so before the reader searches.

### GET /api/locations/reverse

The name of a point. Disabled with 503 unavailable unless WJ_GEOCODING_ENABLED=true, because the point is sent to a third party service. The query holds lat and lon, and the answer is an array with at most one place. The name comes back in the coordinate system the journal keeps, WGS-84.

---

## Bulk operations

### `POST /api/batch/preview`

The preview of a bulk operation. The body is the same as for the apply call. It answers how many entries the selection covers, so the interface can warn before a destructive action. It is a POST because the selection is sent in the body; a browser cannot send one with a GET.

```json
{ "data": { "count": 42, "entryIds": [1, 2, 3] } }
```

### `POST /api/batch`

```json
{
  "action": "addTags",
  "entryIds": [1, 2, 3],
  "tagIds": [7],
  "tagNames": ["reading"],
  "folderId": 3
}
```

| Action | Effect |
| --- | --- |
| `moveToFolder` | Moves the entries into `folderId`. |
| `moveToDefault` | Moves the entries into the default stream. |
| `addTags` | Adds `tagIds` and `tagNames`. |
| `removeTags` | Removes `tagIds` and `tagNames`. |
| `delete` | Permanently deletes the entries. |

Instead of `entryIds` a `filter` object can be given, which selects the entries the same way the list filter does:

```json
{ "action": "moveToDefault", "filter": { "folderId": 2, "tagIds": [7], "tagMode": "all", "from": "2026-01-01", "to": "2026-01-31", "q": "rain" } }
```

Response `200`:

```json
{ "data": { "affected": 3, "entryIds": [1, 2, 3] } }
```

---

## Settings

### `GET /api/settings`

```json
{ "data": { "language": "en", "timezone": "UTC", "theme": "system", "dateFormat": "YYYY-MM-DD", "aiEnabled": false, "mapTileUrl": "", "compressImages": true, "imageQuality": 80, "imageMaxDimension": 2048 } }
```

### `PATCH /api/settings`

Every field is optional and only the present ones are changed.

```json
{ "language": "zh-CN", "timezone": "Asia/Shanghai", "theme": "light", "dateFormat": "YYYY-MM-DD", "aiEnabled": true, "mapTileUrl": "https://tile.example.com/{z}/{x}/{y}.png", "compressImages": true, "imageQuality": 80, "imageMaxDimension": 2048 }
```

`compressImages`, `imageQuality` and `imageMaxDimension` decide how the interface treats the pictures before they are sent. The quality is a number from 30 to 95, the longest side is a number of pixels between 640 and 4096, and zero keeps the original size.

`aiEnabled` is the per account consent. It is `false` by default, so no entry text leaves the server unless the user turns it on.

---

## AI features

The AI features are optional. When no provider is configured the journal works without them; only the derived image descriptions and text summaries are missing. A failed model request never fails the save of an entry.

### `GET /api/ai/status`

```json
{ "data": { "configured": true, "enabled": true, "consent": true, "model": "gpt-4o-mini", "textModel": "gpt-4o-mini", "status": "ready" } }
```

`status` is `unavailable` when no provider is configured, `disabled` when the account turned the features off, and `ready` otherwise.

### `GET /api/ai/metadata`

The derived metadata. Filter with `?entryId=` or `?mediaId=`.

### `POST /api/ai/reprocess`

Queues the processing again.

```json
{ "entryId": 4 }
```

or

```json
{ "mediaId": 10 }
```

or

```json
{ "all": true }
```

Returns `503 unavailable` when no provider is configured and `403 forbidden` when the account has the features turned off.
