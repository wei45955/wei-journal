import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { emptyFilters } from '../components/entries/filters'
import type { TimelineFilters } from '../components/entries/filters'
import { useAuth } from './auth'

/** The order the entries are shown in. */
export type TimelineOrder = 'desc' | 'asc'

interface TimelineState {
  /** The filters that are applied. They stay when the page is left. */
  filters: TimelineFilters
  setFilters: Dispatch<SetStateAction<TimelineFilters>>
  /** The order of the entries. */
  order: TimelineOrder
  setOrder: (order: TimelineOrder) => void
  /** Remembers the place the list was left at. */
  rememberScroll: (value: number) => void
  /** The remembered place in the list. */
  takeScroll: () => number
}

const TimelineContext = createContext<TimelineState | null>(null)

/**
 * The state of the timeline.
 *
 * It lives above the pages, so the filters and the place in the list
 * survive a trip to an entry and back.
 */
export function TimelineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [filters, setFilters] = useState<TimelineFilters>(emptyFilters)
  const [order, setOrder] = useState<TimelineOrder>('desc')
  const scrollRef = useRef(0)

  // Filters and the remembered place belong to one account. Signing in as
  // someone else starts from a clean timeline.
  const lastUserId = useRef<number | undefined>(undefined)
  useEffect(() => {
    const current = user?.id
    if (lastUserId.current === current) return
    lastUserId.current = current
    setFilters(emptyFilters)
    setOrder('desc')
    scrollRef.current = 0
  }, [user?.id])

  const rememberScroll = useCallback((value: number) => {
    scrollRef.current = value
  }, [])

  const takeScroll = useCallback(() => scrollRef.current, [])

  const value = useMemo<TimelineState>(
    () => ({ filters, setFilters, order, setOrder, rememberScroll, takeScroll }),
    [filters, order, rememberScroll, takeScroll],
  )

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>
}

export function useTimeline(): TimelineState {
  const context = useContext(TimelineContext)
  if (!context) throw new Error('useTimeline must be used inside TimelineProvider')
  return context
}
