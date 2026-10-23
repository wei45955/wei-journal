/**
 * A small stale-while-revalidate cache.
 *
 * A page that was visited before opens with what it showed last time and
 * refreshes quietly underneath. That is what keeps moving between the tabs
 * free of skeletons and flashes: the screen only changes when the data does.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

interface Slot<T> {
  data?: T
  error?: unknown
  at: number
  inflight?: Promise<T>
}

const slots = new Map<string, Slot<unknown>>()
const listeners = new Map<string, Set<() => void>>()
let generation = 0

function emit(key: string) {
  listeners.get(key)?.forEach((listener) => listener())
}

function subscribe(key: string, listener: () => void) {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  set.add(listener)
  return () => {
    set.delete(listener)
  }
}

export function peek<T>(key: string): T | undefined {
  return slots.get(key)?.data as T | undefined
}

/** The cached values of every key that starts with the prefix. */
export function scan<T>(prefix: string): T[] {
  const found: T[] = []
  for (const [key, slot] of slots) {
    if (key.startsWith(prefix) && slot.data !== undefined) found.push(slot.data as T)
  }
  return found
}

export function prime<T>(key: string, data: T) {
  slots.set(key, { data, at: Date.now() })
  emit(key)
}

/** Fetches a key, sharing a request that is already on its way. */
export function load<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const current = slots.get(key) as Slot<T> | undefined
  if (current?.inflight) return current.inflight
  const mine = generation
  const task = fetcher()
  const slot: Slot<T> = { ...(current ?? { at: 0 }), inflight: task }
  slots.set(key, slot as Slot<unknown>)
  task.then(
    (data) => {
      if (mine !== generation) return
      slots.set(key, { data, at: Date.now() })
      emit(key)
    },
    (error) => {
      if (mine !== generation) return
      slots.set(key, { data: current?.data, error, at: current?.at ?? 0 })
      emit(key)
    },
  )
  return task
}

/** Marks every key that starts with one of the prefixes as stale and refetches the watched ones. */
export function invalidate(...prefixes: string[]) {
  for (const key of slots.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      const slot = slots.get(key)
      if (slot) slots.set(key, { ...slot, at: 0 })
      emit(key)
    }
  }
}

/** Drops everything, used when the account changes. */
export function clearCache() {
  generation += 1
  slots.clear()
  for (const key of listeners.keys()) emit(key)
}

const STALE_AFTER = 20_000

export interface Resource<T> {
  data: T | undefined
  error: unknown
  /** True only while nothing is on screen yet. */
  loading: boolean
  /** True while a refresh runs behind data that is already shown. */
  refreshing: boolean
  reload: () => Promise<T | undefined>
}

/**
 * Reads a key from the cache. `key` may be null to skip the request.
 */
export function useResource<T>(key: string | null, fetcher: () => Promise<T>): Resource<T> {
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const [refreshing, setRefreshing] = useState(false)

  const snapshot = useSyncExternalStore(
    useCallback((listener) => (key ? subscribe(key, listener) : () => undefined), [key]),
    () => (key ? slots.get(key) : undefined),
  ) as Slot<T> | undefined

  const run = useCallback(async () => {
    if (!key) return undefined
    setRefreshing(true)
    try {
      return await load(key, () => fetcherRef.current())
    } catch {
      return undefined
    } finally {
      setRefreshing(false)
    }
  }, [key])

  const stale = !snapshot || snapshot.at === 0 || Date.now() - snapshot.at > STALE_AFTER
  useEffect(() => {
    if (!key || !stale || snapshot?.inflight) return
    void run()
  }, [key, stale, snapshot?.inflight, run])

  return {
    data: snapshot?.data,
    error: snapshot?.data === undefined ? snapshot?.error : undefined,
    loading: Boolean(key) && snapshot?.data === undefined && snapshot?.error === undefined,
    refreshing,
    reload: run,
  }
}
