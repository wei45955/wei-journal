import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Tag } from '../lib/types'

interface TagsState {
  tags: Tag[]
  loading: boolean
  reload: () => Promise<void>
  create: (name: string) => Promise<Tag>
  rename: (id: number, name: string) => Promise<void>
  remove: (id: number) => Promise<void>
}

let cache: Tag[] = []
let inflight: Promise<Tag[]> | null = null
const listeners = new Set<(tags: Tag[]) => void>()

async function fetchTags(): Promise<Tag[]> {
  if (!inflight) {
    inflight = api
      .tags()
      .then((result) => result.items)
      .finally(() => {
        inflight = null
      })
  }
  const result = await inflight
  cache = result
  for (const listener of listeners) listener(result)
  return result
}

/** The tag list is shared, so it is fetched once and broadcast. */
export function useTags(): TagsState {
  const [tags, setTags] = useState<Tag[]>(cache)
  const [loading, setLoading] = useState(cache.length === 0)

  useEffect(() => {
    const listener = (next: Tag[]) => setTags(next)
    listeners.add(listener)
    if (cache.length === 0) {
      void fetchTags().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return () => {
      listeners.delete(listener)
    }
  }, [])

  const reload = useCallback(async () => {
    await fetchTags()
  }, [])

  const create = useCallback(async (name: string) => {
    const tag = await api.createTag(name)
    await fetchTags()
    return tag
  }, [])

  const rename = useCallback(async (id: number, name: string) => {
    await api.updateTag(id, { name })
    await fetchTags()
  }, [])

  const remove = useCallback(async (id: number) => {
    await api.deleteTag(id)
    await fetchTags()
  }, [])

  return { tags, loading, reload, create, rename, remove }
}
