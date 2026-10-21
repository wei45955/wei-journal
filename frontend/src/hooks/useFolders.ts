import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Folder } from '../lib/types'

interface FoldersState {
  folders: Folder[]
  loading: boolean
  reload: () => Promise<void>
  create: (name: string) => Promise<Folder>
  rename: (id: number, name: string) => Promise<void>
  remove: (id: number, strategy: 'default' | 'delete') => Promise<void>
  reorder: (ids: number[]) => Promise<void>
}

let cache: Folder[] = []
let inflight: Promise<Folder[]> | null = null
let generation = 0
const listeners = new Set<(folders: Folder[]) => void>()

async function fetchFolders(): Promise<Folder[]> {
  const mine = generation
  if (!inflight) {
    const task = api.folders().then((result) => result.items)
    inflight = task
    void task.finally(() => {
      if (inflight === task) inflight = null
    })
  }
  const result = await inflight
  if (mine !== generation) return result
  cache = result
  for (const listener of listeners) listener(result)
  return result
}

/**
 * Drops the list of one account when the session changes.
 *
 * The cache lives outside React, so without this the folders of the account
 * that has just signed out can be shown to the next one for a moment.
 */
export function resetFolderCache() {
  generation += 1
  cache = []
  inflight = null
  for (const listener of listeners) listener([])
}

/**
 * The folder list is shared by the sidebar, the folder manager and the
 * filters, so it is fetched once and broadcast to every consumer.
 */
export function useFolders(): FoldersState {
  const [folders, setFolders] = useState<Folder[]>(cache)
  const [loading, setLoading] = useState(cache.length === 0)

  useEffect(() => {
    const listener = (next: Folder[]) => setFolders(next)
    listeners.add(listener)
    if (cache.length === 0) {
      // A failed fetch leaves an empty list and is retried when a folder is
      // created or the page changes; it must not become an unhandled
      // rejection in the console.
      void fetchFolders()
        .catch(() => {})
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const reload = useCallback(async () => {
    await fetchFolders()
  }, [])

  const create = useCallback(async (name: string) => {
    const folder = await api.createFolder(name)
    await fetchFolders()
    return folder
  }, [])

  const rename = useCallback(async (id: number, name: string) => {
    await api.updateFolder(id, { name })
    await fetchFolders()
  }, [])

  const remove = useCallback(async (id: number, strategy: 'default' | 'delete') => {
    await api.deleteFolder(id, strategy, strategy === 'delete')
    await fetchFolders()
  }, [])

  const reorder = useCallback(async (ids: number[]) => {
    const updated = await api.reorderFolders(ids)
    cache = updated
    for (const listener of listeners) listener(updated)
  }, [])

  return { folders, loading, reload, create, rename, remove, reorder }
}
