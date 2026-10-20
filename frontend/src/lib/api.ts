/**
 * A thin client for the journal API.
 *
 * Every response uses the same envelope, so unwrapping happens in one place.
 * A successful call returns the payload itself; a failed one throws an
 * ApiError carrying the server's code and field details.
 *
 * The CSRF token is read from the readable cookie the server sets and sent
 * back in the X-CSRF-Token header on every mutating request.
 */

import type {
  AIMetadata,
  AIStatus,
  BatchPreview,
  CalendarResponse,
  Entry,
  Folder,
  GeocodeResult,
  Location,
  MapPlace,
  Media,
  SearchResult,
  Session,
  Settings,
  Stats,
  Tag,
  User,
} from './types'

const CSRF_COOKIE = 'wj_csrf'

export class ApiError extends Error {
  status: number
  code: string
  details: Record<string, string>

  constructor(status: number, code: string, message: string, details: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }

  get isUnauthorized() {
    return this.status === 401
  }

  get isConflict() {
    return this.status === 409
  }

  get isValidation() {
    return this.status === 400
  }
}

interface Meta {
  nextCursor?: string
  hasMore?: boolean
  total?: number
  limit?: number
}

interface Envelope<T> {
  data?: T
  error?: { code: string; message: string; details?: Record<string, string> }
  meta?: Meta
}

function readCookie(name: string): string {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : ''
}

export interface ListResult<T> {
  items: T[]
  nextCursor: string
  hasMore: boolean
  total?: number
}

interface RequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  signal?: AbortSignal
}

async function requestRaw<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: Meta }> {
  return send<T>(path, options, true)
}

/**
 * A session that has been idle for too long is renewed once and the request
 * is sent again. The renewal is shared, so a burst of parallel requests
 * results in a single call to the renewal endpoint.
 */
let renewal: Promise<boolean> | null = null

function renewSession(): Promise<boolean> {
  if (!renewal) {
    const current = (async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        })
        return response.ok
      } catch {
        return false
      }
    })()
    renewal = current
    void current.finally(() => {
      // The next request starts a new renewal.
      if (renewal === current) renewal = null
    })
  }
  return renewal
}

async function send<T>(
  path: string,
  options: RequestOptions,
  allowRenewal: boolean,
): Promise<{ data: T; meta?: Meta }> {
  const method = options.method ?? 'GET'
  const url = new URL(path, window.location.origin)
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value === undefined || value === null || value === '') continue
      url.searchParams.set(key, String(value))
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  let body: BodyInit | undefined
  if (options.body instanceof FormData) {
    body = options.body
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) headers['X-CSRF-Token'] = csrf
  }

  let response: Response
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body,
      credentials: 'same-origin',
      signal: options.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new ApiError(0, 'network_error', 'The server could not be reached.')
  }

  if (response.status === 204) {
    return { data: undefined as T }
  }

  const text = await response.text()
  let envelope: Envelope<T> = {}
  if (text) {
    try {
      envelope = JSON.parse(text) as Envelope<T>
    } catch {
      throw new ApiError(response.status, 'invalid_response', 'The server sent an unreadable response.')
    }
  }

  if (!response.ok) {
    const err = envelope.error
    // The server reports a session that only has to be renewed. The request
    // is sent again once the session is renewed.
    if (allowRenewal && response.status === 401 && err?.code === 'session_expired') {
      if (await renewSession()) {
        return send<T>(path, options, false)
      }
    }
    throw new ApiError(
      response.status,
      err?.code ?? 'internal_error',
      err?.message ?? 'Something went wrong.',
      err?.details ?? {},
    )
  }
  return { data: envelope.data as T, meta: envelope.meta }
}

/** Performs a request and returns the payload it carries. */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data } = await requestRaw<T>(path, options)
  return data
}

/** Performs a request against a collection and returns the page. */
async function list<T>(path: string, query?: RequestOptions['query']): Promise<ListResult<T>> {
  const { data, meta } = await requestRaw<T[]>(path, { query })
  return {
    items: data ?? [],
    nextCursor: meta?.nextCursor ?? '',
    hasMore: meta?.hasMore ?? false,
    total: meta?.total,
  }
}

/** Query parameters accepted by the entry listing. */
export interface EntryQuery {
  folderId?: number | 'none'
  tags?: number[]
  tagMode?: 'any' | 'all'
  from?: string
  to?: string
  mediaType?: string
  pinned?: boolean
  q?: string
  limit?: number
  cursor?: string
  order?: 'asc' | 'desc'
}

export interface EntryPayload {
  title?: string
  /** Serialised Tiptap document. The server stores the structured document. */
  document?: string
  /** Serialised vector stroke list. */
  drawing?: string
  /** RFC 3339 timestamp. */
  eventTime?: string
  timezone?: string
  folderId?: number | null
  tagIds?: number[]
  tagNames?: string[]
  color?: string
  isPinned?: boolean
  mediaIds?: number[]
  /** The revision the edit was based on; a mismatch is rejected with 409. */
  revision?: number
}

export interface BatchRequest {
  action: 'moveToFolder' | 'moveToDefault' | 'addTags' | 'removeTags' | 'delete'
  entryIds?: number[]
  folderId?: number
  tagIds?: number[]
  tagNames?: string[]
  tagMode?: 'any' | 'all'
  filter?: {
    folderId?: number
    tagIds?: number[]
    tagMode?: 'any' | 'all'
    from?: string
    to?: string
    q?: string
  }
}

export interface AuthResult {
  user: User
  csrfToken: string
}

export const api = {
  // --- authentication -----------------------------------------------------
  register: (username: string, password: string, email?: string) =>
    request<AuthResult>('/api/auth/register', {
      method: 'POST',
      body: { username, password, email },
    }),
  login: (username: string, password: string) =>
    request<AuthResult>('/api/auth/login', { method: 'POST', body: { username, password } }),
  refresh: () => request<{ csrfToken: string; expiresAt: string }>('/api/auth/refresh', { method: 'POST' }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  me: () => request<AuthResult>('/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ csrfToken: string }>('/api/auth/password', {
      method: 'POST',
      body: { currentPassword, newPassword },
    }),
  sessions: () => list<Session>('/api/auth/sessions'),
  revokeSession: (id: number) => request<void>(`/api/auth/sessions/${id}`, { method: 'DELETE' }),

  // --- entries ------------------------------------------------------------
  entries: (query?: EntryQuery) => {
    const params: Record<string, string | number | boolean | undefined> = {}
    if (query) {
      if (query.folderId !== undefined) params.folderId = query.folderId
      if (query.tags?.length) params.tags = query.tags.join(',')
      if (query.tagMode) params.tagMode = query.tagMode
      if (query.from) params.from = query.from
      if (query.to) params.to = query.to
      if (query.mediaType) params.mediaType = query.mediaType
      if (query.pinned) params.pinned = true
      if (query.q) params.q = query.q
      if (query.limit) params.limit = query.limit
      if (query.cursor) params.cursor = query.cursor
      if (query.order) params.order = query.order
    }
    return list<Entry>('/api/entries', params)
  },
  entry: (id: number) => request<Entry>(`/api/entries/${id}`),
  createEntry: (payload: EntryPayload) => request<Entry>('/api/entries', { method: 'POST', body: payload }),
  updateEntry: (id: number, payload: EntryPayload) =>
    request<Entry>(`/api/entries/${id}`, { method: 'PATCH', body: payload }),
  deleteEntry: (id: number) => request<void>(`/api/entries/${id}`, { method: 'DELETE' }),
  setEntryLocation: (
    id: number,
    location: { name: string; address?: string; latitude: number; longitude: number },
  ) => request<Location>(`/api/entries/${id}/location`, { method: 'POST', body: location }),
  clearEntryLocation: (id: number) => request<void>(`/api/entries/${id}/location`, { method: 'DELETE' }),

  // --- folders and tags ---------------------------------------------------
  folders: () => list<Folder>('/api/folders'),
  createFolder: (name: string, color?: string, icon?: string) =>
    request<Folder>('/api/folders', { method: 'POST', body: { name, color, icon } }),
  updateFolder: (id: number, payload: { name: string; color?: string; icon?: string }) =>
    request<Folder>(`/api/folders/${id}`, { method: 'PATCH', body: payload }),
  deleteFolder: (id: number, strategy: 'default' | 'delete', confirm: boolean) =>
    request<void>(`/api/folders/${id}`, {
      method: 'DELETE',
      query: { strategy, confirm: confirm ? 'true' : undefined },
    }),
  reorderFolders: (folderIds: number[]) =>
    request<Folder[]>('/api/folders/reorder', { method: 'POST', body: { folderIds } }),

  tags: (q?: string) => list<Tag>('/api/tags', q ? { q } : undefined),
  createTag: (name: string, color?: string) =>
    request<Tag>('/api/tags', { method: 'POST', body: { name, color } }),
  updateTag: (id: number, payload: { name: string; color?: string }) =>
    request<Tag>(`/api/tags/${id}`, { method: 'PATCH', body: payload }),
  deleteTag: (id: number) => request<void>(`/api/tags/${id}`, { method: 'DELETE' }),

  // --- media --------------------------------------------------------------
  media: (query?: { entryId?: number; kind?: string }) => list<Media>('/api/media', query),
  uploadMedia: (files: File[]) => {
    const form = new FormData()
    for (const file of files) form.append('files', file)
    return request<Media[]>('/api/media', { method: 'POST', body: form })
  },
  uploadLivePhoto: (still: File, motion: File) => {
    const form = new FormData()
    form.append('still', still)
    form.append('motion', motion)
    return request<{ livePhotoId: number; still: Media; motion: Media }>('/api/media/live', {
      method: 'POST',
      body: form,
    })
  },
  linkLivePhoto: (stillId: number, motionId: number) =>
    request<{ livePhotoId: number }>(`/api/media/${stillId}/link`, {
      method: 'POST',
      body: { motionId },
    }),
  updateMedia: (id: number, payload: Record<string, unknown>) =>
    request<Media>(`/api/media/${id}`, { method: 'PATCH', body: payload }),
  deleteMedia: (id: number) => request<void>(`/api/media/${id}`, { method: 'DELETE' }),

  // --- discovery ----------------------------------------------------------
  search: (
    query: string,
    options?: { limit?: number; offset?: number; type?: string; from?: string; to?: string },
  ) =>
    list<SearchResult>('/api/search', {
      q: query,
      limit: options?.limit,
      offset: options?.offset,
      type: options?.type,
      from: options?.from,
      to: options?.to,
    }),
  calendar: (view: 'day' | 'month' | 'year', date?: string) =>
    request<CalendarResponse>('/api/calendar', { query: { view, date } }),
  stats: () => request<Stats>('/api/stats'),
  locations: (query?: {
    from?: string
    to?: string
    folderId?: number | 'none'
    tags?: number[]
    entryId?: number
  }) => {
    const params: Record<string, string | number | undefined> = {}
    if (query?.from) params.from = query.from
    if (query?.to) params.to = query.to
    if (query?.folderId !== undefined) params.folderId = query.folderId
    if (query?.entryId !== undefined) params.entryId = query.entryId
    if (query?.tags?.length) params.tags = query.tags.join(',')
    return list<MapPlace>('/api/locations', params)
  },
  geocode: (q: string) => list<GeocodeResult>('/api/locations/search', { q }),
  ownLocations: (q: string) => list<GeocodeResult>('/api/locations/own', { q }),

  // --- bulk ---------------------------------------------------------------
  batch: (payload: BatchRequest) =>
    request<{ affected: number; entryIds: number[] }>('/api/batch', { method: 'POST', body: payload }),
  batchPreview: (payload: BatchRequest) =>
    request<BatchPreview>('/api/batch/preview', { method: 'POST', body: payload }),

  // --- account ------------------------------------------------------------
  settings: () => request<Settings>('/api/settings'),
  updateSettings: (payload: Partial<Settings> & { alignZone?: string }) =>
    request<Settings>('/api/settings', { method: 'PATCH', body: payload }),
  aiStatus: () => request<AIStatus>('/api/ai/status'),
  aiMetadata: (query?: { entryId?: number; mediaId?: number }) =>
    list<AIMetadata>('/api/ai/metadata', query),
  reprocessAI: (payload: { entryId?: number; mediaId?: number; all?: boolean }) =>
    request<{ queued: number }>('/api/ai/reprocess', { method: 'POST', body: payload }),
  exportJournal: (includeMedia = false) =>
    request<Record<string, unknown>>('/api/export', {
      query: { includeMedia: includeMedia ? 'true' : undefined },
    }),
  health: () => request<{ status: string; version: string }>('/api/health'),
}

/**
 * Uploads files with progress reporting.
 *
 * `fetch` cannot report upload progress, so the request is made with
 * XMLHttpRequest. The caller gets an abort handle to cancel a long upload.
 */
export function uploadFilesWithProgress(
  files: File[],
  onProgress?: (percent: number) => void,
): { promise: Promise<Media[]>; abort: () => void } {
  const xhr = new XMLHttpRequest()
  const promise = new Promise<Media[]>((resolve, reject) => {
    const form = new FormData()
    for (const file of files) form.append('files', file)

    xhr.open('POST', '/api/media')
    xhr.withCredentials = true
    const csrf = readCookie(CSRF_COOKIE)
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf)
    xhr.setRequestHeader('Accept', 'application/json')

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || !onProgress) return
      onProgress(Math.round((event.loaded / event.total) * 100))
    })

    xhr.addEventListener('load', () => {
      let envelope: Envelope<Media[]> = {}
      try {
        envelope = JSON.parse(xhr.responseText) as Envelope<Media[]>
      } catch {
        reject(new ApiError(xhr.status, 'invalid_response', 'The server sent an unreadable response.'))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(envelope.data ?? [])
        return
      }
      const err = envelope.error
      reject(
        new ApiError(
          xhr.status,
          err?.code ?? 'internal_error',
          err?.message ?? 'The upload failed.',
          err?.details ?? {},
        ),
      )
    })

    xhr.addEventListener('error', () =>
      reject(new ApiError(0, 'network_error', 'The server could not be reached.')),
    )
    xhr.addEventListener('abort', () =>
      reject(new ApiError(0, 'aborted', 'The upload was cancelled.')),
    )

    xhr.send(form)
  })

  return { promise, abort: () => xhr.abort() }
}
