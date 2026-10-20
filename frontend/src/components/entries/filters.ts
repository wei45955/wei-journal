import type { EntryQuery } from '../../lib/api'

/** The filters that can be applied to the timeline. */
export interface TimelineFilters {
  folderId?: number | 'none'
  tagIds: number[]
  tagMode: 'any' | 'all'
  from?: string
  to?: string
  mediaType?: string
  pinned?: boolean
  q?: string
}

export const emptyFilters: TimelineFilters = {
  tagIds: [],
  tagMode: 'any',
}

export function filtersToQuery(filters: TimelineFilters): EntryQuery {
  return {
    folderId: filters.folderId,
    tags: filters.tagIds.length ? filters.tagIds : undefined,
    tagMode: filters.tagIds.length ? filters.tagMode : undefined,
    from: filters.from,
    to: filters.to,
    mediaType: filters.mediaType,
    pinned: filters.pinned || undefined,
    q: filters.q,
  }
}

export function hasActiveFilters(filters: TimelineFilters): boolean {
  return Boolean(
    filters.folderId !== undefined ||
      filters.tagIds.length > 0 ||
      filters.from ||
      filters.to ||
      filters.mediaType ||
      filters.pinned ||
      filters.q,
  )
}
