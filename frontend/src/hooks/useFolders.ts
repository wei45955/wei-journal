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
const listeners = new Set<(folders: Folder[]) => void>()

async function fetchFolders(): Promise<Folder[]> {
  if (!inflight) {
    inflight = api.folders().then((result) => result.items).finally(() => {
      inflight = null
    })
  }
  const result = await inflight
  cache = result
  for (const listener of listeners) listener(result)
  return result
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
      void fetchFolders().finally(() => setLoading(false))
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
