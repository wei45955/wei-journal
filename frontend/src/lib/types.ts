/**
 * Types mirroring the backend DTOs in backend/internal/api/dto.go.
 */

export type Role = 'admin' | 'user'

export interface Settings {
  language: string
  timezone: string
  theme: string
  dateFormat: string
  aiEnabled: boolean
  mapTileUrl: string
  /** Whether the uploaded pictures are compressed before they are sent. */
  compressImages: boolean
  /** The quality of a compressed picture, from 30 to 95. */
  imageQuality: number
  /** The longest side a compressed picture may have. Zero keeps the original. */
  imageMaxDimension: number
}

export interface User {
  id: number
  username: string
  email: string
  role: Role
  createdAt: string
  lastLoginAt?: string
  settings: Settings
}

export interface Folder {
  id: number
  name: string
  color: string
  icon: string
  position: number
  entryCount: number
  createdAt: string
  updatedAt: string
}

export interface Tag {
  id: number
  name: string
  color: string
  entryCount: number
  createdAt: string
}

export type MediaKind = 'image' | 'video' | 'audio' | 'file' | 'live-still' | 'live-motion'

export interface Media {
  id: number
  entryId?: number | null
  livePhotoId?: number | null
  liveRole: string
  kind: MediaKind
  originalName: string
  mimeType: string
  size: number
  width: number
  height: number
  durationMs: number
  url: string
  thumbUrl: string
  previewUrl: string
  hasThumb: boolean
  hasPreview: boolean
  latitude?: number | null
  longitude?: number | null
  locationName?: string
  locationSource?: string
  aiStatus: string
  description: string
  createdAt: string
}

export interface Location {
  id: number
  entryId?: number | null
  mediaId?: number | null
  name: string
  address: string
  latitude: number
  longitude: number
  source: string
  status: string
  createdAt: string
}

/** A Tiptap document node. Kept loose because the editor owns the shape. */
export interface DocNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  content?: DocNode[]
}

/** A single vector stroke in the drawing document. */
export interface Stroke {
  id?: string
  color: string
  width: number
  points: Array<[number, number]>
  /** 0..1, relative to the canvas box the points were captured in. */
  opacity?: number
  tool?: 'pen' | 'eraser'
}

export interface AIMetadata {
  id: number
  entryId?: number | null
  mediaId?: number | null
  kind: string
  status: string
  description: string
  summary: string
  keywords: string[]
  suggestedTags: string[]
  model: string
  error?: string
  updatedAt: string
}

export interface Entry {
  id: number
  folderId?: number | null
  title: string
  eventTime: string
  eventDate: string
  timezone: string
  document: DocNode
  drawing: Stroke[]
  plainText: string
  color: string
  isPinned: boolean
  wordCount: number
  revision: number
  createdAt: string
  updatedAt: string
  tags: Tag[]
  media: Media[]
  location?: Location | null
  aiMetadata: AIMetadata[]
  folderName?: string
  /** The picture that leads the entry in the timeline. */
  coverMediaId?: number | null
}

export interface Session {
  id: number
  current: boolean
  userAgent: string
  ip: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
}

export interface SearchMatch {
  entryId: number
  mediaId?: number | null
  kind: string
  field: string
  score: number
  snippet: string
}

export interface SearchResult {
  entry: Entry
  matches: SearchMatch[]
}

export interface CalendarDay {
  date: string
  count: number
}

export interface CalendarResponse {
  view: 'day' | 'month' | 'year'
  start: string
  end: string
  total: number
  days: CalendarDay[]
}

export interface Stats {
  totalEntries: number
  totalPhotos: number
  totalVideos: number
  totalAudios: number
  totalFiles: number
  totalWords: number
  activeDays: number
  currentStreak: number
  longestStreak: number
  firstEntryDate: string
  lastEntryDate: string
  /** The entries written in the current year. */
  entriesThisYear: number
  /** The year the counts above belong to. */
  currentYear: number
}

export interface AIStatus {
  configured: boolean
  enabled: boolean
  consent: boolean
  model: string
  textModel: string
  status: 'ready' | 'disabled' | 'unavailable'
}

/** A place reference, before it is stored as a full location record. */
export interface PlaceRef {
  name: string
  address: string
  latitude: number
  longitude: number
}

/** A place that can be shown on the map. */
export interface MapPlace {
  id: number
  entryId?: number | null
  mediaId?: number | null
  name: string
  address: string
  latitude: number
  longitude: number
  source: string
  status: string
  title: string
  date: string
  mediaKind: string
  /** The photo taken at this place, when there is one. */
  thumbUrl?: string
  /** How many entries were written at this place. */
  entryCount: number
}

export interface GeocodeResult {
  name: string
  address: string
  latitude: number
  longitude: number
}

export interface BatchPreview {
  count: number
  entryIds: number[]
}
