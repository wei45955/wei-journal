/**
 * Folders and tags, shared by every screen through the cache.
 *
 * Anything that changes an entry also changes the counts shown next to the
 * folders and tags, so `afterEntryChange` refreshes them together with the
 * lists, the calendar and the numbers.
 */

import { api } from '../lib/api'
import { invalidate, useResource } from '../lib/cache'
import type { Folder, Tag } from '../lib/types'

export function useFolders() {
  const resource = useResource<Folder[]>('folders', async () => (await api.folders()).items)
  return { folders: resource.data ?? [], loading: resource.loading, reload: resource.reload }
}

export function useTags() {
  const resource = useResource<Tag[]>('tags', async () => (await api.tags()).items)
  return { tags: resource.data ?? [], loading: resource.loading, reload: resource.reload }
}

/** Call after any change to entries, so every view shows the new state. */
export function afterEntryChange() {
  invalidate('entries', 'entry:', 'folders', 'tags', 'stats', 'calendar', 'places', 'search')
}

export async function createFolder(name: string): Promise<Folder> {
  const folder = await api.createFolder(name.trim())
  invalidate('folders')
  return folder
}

export async function renameFolder(id: number, name: string) {
  await api.updateFolder(id, { name: name.trim() })
  afterEntryChange()
}

export async function deleteFolder(id: number, strategy: 'default' | 'delete') {
  await api.deleteFolder(id, strategy, strategy === 'delete')
  afterEntryChange()
}

export async function reorderFolders(ids: number[]) {
  await api.reorderFolders(ids)
  invalidate('folders')
}

export async function createTag(name: string): Promise<Tag> {
  const tag = await api.createTag(name.trim())
  invalidate('tags')
  return tag
}

export async function renameTag(id: number, name: string) {
  await api.updateTag(id, { name: name.trim() })
  afterEntryChange()
}

export async function deleteTag(id: number) {
  await api.deleteTag(id)
  afterEntryChange()
}
