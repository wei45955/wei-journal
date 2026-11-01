import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { useResource } from '../../lib/cache'
import type { AIMetadata, AIStatus, Entry } from '../../lib/types'
import { afterEntryChange } from '../../state/library'
import { useToast } from '../../state/toast'
import { prime } from '../../lib/cache'
import { Button } from '../../ui'
import { PlusIcon, SparkIcon } from '../../ui/icons'

/**
 * What the optional model wrote about the entry. It sits apart from the
 * entry, in the interface's own voice, so it is never mistaken for the
 * writer's words.
 */
export function AiNotes({ entry }: { entry: Entry }) {
  const { t } = useTranslation()
  const { notify, describe } = useToast()
  const [busy, setBusy] = useState(false)
  const status = useResource<AIStatus>('ai:status', () => api.aiStatus())
  const metadata = entry.aiMetadata ?? []
  const ready = Boolean(status.data?.configured && status.data?.enabled)
  // An entry that has never been looked at has nothing to show, but there
  // is still something to ask for.
  const askable = ready && metadata.length === 0 && (entry.media?.length ?? 0) > 0
  if (metadata.length === 0 && !askable) return null

  const text = metadata.find((item) => item.kind === 'text')
  const images = metadata.filter((item) => item.kind === 'image' && item.description)
  const working = metadata.some((item) => item.status === 'pending' || item.status === 'processing')
  const failed = metadata.some((item) => item.status === 'failed')
  // An empty list has nothing to say about the model: every() on no rows is
  // true, which would report a model as missing for an entry that was never
  // looked at.
  const unavailable = metadata.length > 0 && metadata.every((item) => item.status === 'unavailable')
  const existing = new Set(entry.tags.map((tag) => tag.name.trim().toLowerCase()))
  const suggestions = Array.from(
    new Set(metadata.flatMap((item: AIMetadata) => item.suggestedTags ?? []).map((name) => name.trim()).filter(Boolean)),
  ).filter((name) => !existing.has(name.toLowerCase()))

  async function addTag(name: string) {
    try {
      const updated = await api.updateEntry(entry.id, {
        tagIds: entry.tags.map((tag) => tag.id),
        tagNames: [name],
      })
      prime(`entry:${entry.id}`, updated)
      afterEntryChange()
      notify(t('ai.added'))
    } catch (error) {
      notify(describe(error), 'error')
    }
  }

  async function again() {
    setBusy(true)
    try {
      const result = await api.reprocessAI({ entryId: entry.id })
      notify(result.queued > 0 ? t('ai.queued') : t('ai.nothingQueued'))
    } catch (error) {
      notify(describe(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-t border-rule pt-5">
      <h2 className="title-3 flex items-center gap-2 text-ink-2">
        <SparkIcon size={17} className="text-accent" />
        {t('ai.title')}
      </h2>

      {text?.summary ? (
        <p className="body-1 mt-2 text-ink">{text.summary}</p>
      ) : working ? (
        <p className="body-2 mt-2 text-ink-2">{t('ai.pending')}</p>
      ) : askable ? null : unavailable ? (
        <p className="body-2 mt-2 text-ink-2">{t('ai.unavailable')}</p>
      ) : failed ? (
        <p className="body-2 mt-2 text-ink-2">{t('ai.failed')}</p>
      ) : null}

      {images.length > 0 ? (
        <div className="mt-3">
          <p className="caption text-ink-3">{t('ai.photos')}</p>
          <ul className="mt-1 flex flex-col gap-1.5">
            {images.map((item) => (
              <li key={item.id} className="body-2 text-ink-2">
                {item.description}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {suggestions.length > 0 ? (
        <div className="mt-4">
          <p className="caption text-ink-3">{t('ai.suggested')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {suggestions.slice(0, 8).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => void addTag(name)}
                className="press flex h-8 items-center gap-1 rounded-md bg-well pr-3 pl-2 text-sm text-ink hover:text-accent"
              >
                <PlusIcon size={14} className="text-accent" />
                {name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="caption text-ink-3">{askable ? t('ai.nothingYet') : t('ai.note')}</p>
        {askable ? (
          <Button size="sm" tone="quiet" loading={busy} onClick={() => void again()} className="-mr-3">
            {t('ai.ask')}
          </Button>
        ) : failed || unavailable || text?.summary ? (
          <Button size="sm" tone="quiet" loading={busy} onClick={() => void again()} className="-mr-3">
            {t('ai.again')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}
