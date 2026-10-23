/* eslint-disable react-refresh/only-export-components */
/**
 * The state of the journal view that outlives a visit to an entry: the
 * filters and the order. The folder is not kept here; the address holds it,
 * so the back button and a shared link both land in the right place.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { EntryQuery } from '../lib/api'
import { useAuth } from './auth'

export interface JournalFilters {
  tagIds: number[]
  tagMode: 'any' | 'all'
  from?: string
  to?: string
  mediaType?: string
  pinned?: boolean
}

export const noFilters: JournalFilters = { tagIds: [], tagMode: 'any' }

export function activeFilterCount(filters: JournalFilters): number {
  return (
    (filters.tagIds.length > 0 ? 1 : 0) +
    (filters.from || filters.to ? 1 : 0) +
    (filters.mediaType ? 1 : 0) +
    (filters.pinned ? 1 : 0)
  )
}

export function toQuery(filters: JournalFilters, folder: number | 'none' | undefined): EntryQuery {
  return {
    folderId: folder,
    tags: filters.tagIds.length ? filters.tagIds : undefined,
    tagMode: filters.tagIds.length > 1 ? filters.tagMode : undefined,
    from: filters.from,
    to: filters.to,
    mediaType: filters.mediaType,
    pinned: filters.pinned || undefined,
  }
}

interface JournalState {
  filters: JournalFilters
  setFilters: (filters: JournalFilters) => void
  order: 'desc' | 'asc'
  setOrder: (order: 'desc' | 'asc') => void
}

const JournalContext = createContext<JournalState | null>(null)

export function JournalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [filters, setFilters] = useState<JournalFilters>(noFilters)
  const [order, setOrder] = useState<'desc' | 'asc'>('desc')

  const owner = useRef(user?.id)
  useEffect(() => {
    if (owner.current === user?.id) return
    owner.current = user?.id
    setFilters(noFilters)
    setOrder('desc')
  }, [user?.id])

  const value = useMemo(() => ({ filters, setFilters, order, setOrder }), [filters, order])
  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>
}

export function useJournal(): JournalState {
  const context = useContext(JournalContext)
  if (!context) throw new Error('useJournal must be used inside JournalProvider')
  return context
}
