import { describe, expect, it } from 'vitest'
import { emptyFilters, filtersToQuery, hasActiveFilters } from './filters'

describe('filtersToQuery', () => {
  it('leaves out everything that is not set', () => {
    const query = filtersToQuery(emptyFilters)
    expect(query.folderId).toBeUndefined()
    expect(query.tags).toBeUndefined()
    expect(query.tagMode).toBeUndefined()
    expect(query.pinned).toBeUndefined()
    expect(query.q).toBeUndefined()
  })

  it('sends the tag mode only when there are tags to match', () => {
    expect(filtersToQuery({ ...emptyFilters, tagIds: [] }).tagMode).toBeUndefined()
    expect(filtersToQuery({ ...emptyFilters, tagIds: [3], tagMode: 'all' }).tagMode).toBe('all')
  })

  it('keeps the folder that has no entries', () => {
    const query = filtersToQuery({ ...emptyFilters, folderId: 'none' })
    expect(query.folderId).toBe('none')
  })

  it('turns the pinned filter into a true flag rather than false', () => {
    expect(filtersToQuery({ ...emptyFilters, pinned: false }).pinned).toBeUndefined()
    expect(filtersToQuery({ ...emptyFilters, pinned: true }).pinned).toBe(true)
  })
})

describe('hasActiveFilters', () => {
  it('is false for the empty filters', () => {
    expect(hasActiveFilters(emptyFilters)).toBe(false)
  })

  it('is true as soon as one filter is set', () => {
    expect(hasActiveFilters({ ...emptyFilters, folderId: 1 })).toBe(true)
    expect(hasActiveFilters({ ...emptyFilters, folderId: 'none' })).toBe(true)
    expect(hasActiveFilters({ ...emptyFilters, tagIds: [1] })).toBe(true)
    expect(hasActiveFilters({ ...emptyFilters, from: '2026-01-01' })).toBe(true)
    expect(hasActiveFilters({ ...emptyFilters, to: '2026-01-31' })).toBe(true)
    expect(hasActiveFilters({ ...emptyFilters, mediaType: 'image' })).toBe(true)
    expect(hasActiveFilters({ ...emptyFilters, pinned: true })).toBe(true)
    expect(hasActiveFilters({ ...emptyFilters, q: 'rain' })).toBe(true)
  })
})
