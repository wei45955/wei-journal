/**
 * Drafts kept on the device.
 *
 * Every change in the editor is mirrored here until the server confirms it.
 * A save that fails, a tab that is closed or a phone that runs out of battery
 * therefore never loses words: the editor offers the draft the next time the
 * same entry is opened. Signing out removes every draft.
 */

import type { DocNode, Stroke } from './types'

const PREFIX = 'wj.draft.'

export interface Draft {
  savedAt: number
  /** The revision the draft was based on, for an existing entry. */
  revision?: number
  title: string
  document: DocNode
  drawing: Stroke[]
}

function keyOf(id: number | 'new') {
  return `${PREFIX}${id}`
}

export function readDraft(id: number | 'new'): Draft | null {
  try {
    const raw = localStorage.getItem(keyOf(id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Draft
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.savedAt !== 'number') return null
    if (typeof parsed.title !== 'string' || typeof parsed.document !== 'object') return null
    return { ...parsed, drawing: Array.isArray(parsed.drawing) ? parsed.drawing : [] }
  } catch {
    return null
  }
}

export function writeDraft(id: number | 'new', draft: Draft) {
  try {
    localStorage.setItem(keyOf(id), JSON.stringify(draft))
  } catch {
    // A full or refused storage only loses the safety net, never the entry.
  }
}

export function dropDraft(id: number | 'new') {
  try {
    localStorage.removeItem(keyOf(id))
  } catch {
    // Nothing to do.
  }
}

export function clearDrafts() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index)
      if (key?.startsWith(PREFIX)) localStorage.removeItem(key)
    }
  } catch {
    // Nothing to do.
  }
}
