/**
 * The entry list of the journal, cached per scope and filter so that
 * returning from an entry shows the same list, at the same length, at once.
 */

import { useCallback, useState } from 'react'
import { api } from '../../lib/api'
import type { EntryQuery } from '../../lib/api'
import { peek, prime, useResource } from '../../lib/cache'
import type { Entry } from '../../lib/types'

export interface EntryPage {
  items: Entry[]
  cursor: string
  hasMore: boolean
}

const PAGE = 30

export function useEntryList(query: EntryQuery & { order: 'asc' | 'desc' }) {
  const key = `entries:${JSON.stringify(query)}`

  // A refresh asks for as many entries as are already shown, so a list that
  // was scrolled deep keeps its length and the reader keeps their place.
  const fetcher = useCallback(async (): Promise<EntryPage> => {
    const shown = peek<EntryPage>(key)?.items.length ?? 0
    const limit = Math.min(100, Math.max(PAGE, shown))
    const page = await api.entries({ ...query, limit })
    const previous = peek<EntryPage>(key)
    if (previous && previous.items.length > limit) {
      const seen = new Set(page.items.map((entry) => entry.id))
      return {
        items: [...page.items, ...previous.items.slice(limit).filter((entry) => !seen.has(entry.id))],
        cursor: previous.cursor,
        hasMore: previous.hasMore,
      }
    }
    return { items: page.items, cursor: page.nextCursor, hasMore: page.hasMore }
    // The key is the serialised query, so it stands for every value read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const resource = useResource<EntryPage>(key, fetcher)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)

  const loadMore = useCallback(async () => {
    const current = peek<EntryPage>(key)
    if (!current?.hasMore || loadingMore) return
    setLoadingMore(true)
    setMoreError(false)
    try {
      const page = await api.entries({ ...query, limit: PAGE, cursor: current.cursor })
      const latest = peek<EntryPage>(key) ?? current
      const seen = new Set(latest.items.map((entry) => entry.id))
      prime<EntryPage>(key, {
        items: [...latest.items, ...page.items.filter((entry) => !seen.has(entry.id))],
        cursor: page.nextCursor,
        hasMore: page.hasMore,
      })
    } catch {
      setMoreError(true)
    } finally {
      setLoadingMore(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loadingMore])

  return { ...resource, loadMore, loadingMore, moreError }
}
