import { describe, expect, it } from 'vitest'
import { activeFilterCount, noFilters, toQuery } from './journal'

describe('the journal filters', () => {
  it('count each kind of filter once', () => {
    expect(activeFilterCount(noFilters)).toBe(0)
    expect(
      activeFilterCount({ tagIds: [1, 2], tagMode: 'all', from: '2026-01-01', to: '2026-02-01', pinned: true }),
    ).toBe(3)
  })

  it('turn into the query of the entry list', () => {
    expect(toQuery({ tagIds: [3, 4], tagMode: 'all', mediaType: 'image' }, 'none')).toEqual({
      folderId: 'none',
      tags: [3, 4],
      tagMode: 'all',
      from: undefined,
      to: undefined,
      mediaType: 'image',
      pinned: undefined,
    })
  })

  it('leave the tag mode out when only one tag is chosen', () => {
    expect(toQuery({ tagIds: [3], tagMode: 'all' }, undefined).tagMode).toBeUndefined()
  })
})
