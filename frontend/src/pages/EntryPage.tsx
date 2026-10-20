import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { formatTime, formatEventDate, formatDateTime } from '../lib/format'
import { useToast } from '../state/toast'
import { useAuth } from '../state/auth'
import { cn } from '../lib/cn'
import { ErrorState, Skeleton } from '../components/ui'
import { ConfirmDialog } from '../components/ui/Dialog'
import { RichText } from '../components/editor/RichText'
import { DrawingView } from '../components/editor/DrawingView'
import { MediaStrip } from '../components/media/MediaViewer'
import { AIMetadataPanel } from '../components/entries/AIMetadataPanel'
import {
  ChevronLeftIcon,
  CopyIcon,
  LocationIcon,
  PencilIcon,
  PinIcon,
  TrashIcon,
} from '../components/icons'
import type { Entry, Stroke, Tag } from '../lib/types'

/** The read view of one entry. */
export function EntryPage() {
  const { t } = useTranslation()
  const { entryId } = useParams()
  const navigate = useNavigate()
  const { notify, describe } = useToast()
  const { user } = useAuth()
  const [entry, setEntry] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!entryId) return
    setLoading(true)
    setError('')
    try {
      const loaded = await api.entry(Number(entryId))
      setEntry(loaded)
    } catch (err) {
      setError(describe(err, t('errors.notFound')))
    } finally {
      setLoading(false)
    }
  }, [entryId, describe, t])

  useEffect(() => {
    void load()
  }, [load])

  async function togglePin() {
    if (!entry) return
    setBusy(true)
    try {
      const updated = await api.updateEntry(entry.id, { isPinned: !entry.isPinned })
      setEntry(updated)
      notify(updated.isPinned ? t('entries.pinned') : t('entries.unpin'), 'success')
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function duplicate() {
    if (!entry) return
    setBusy(true)
    try {
      const copy = await api.createEntry({
        title: entry.title,
        document: JSON.stringify(entry.document ?? { type: 'doc', content: [] }),
        drawing: JSON.stringify(entry.drawing ?? []),
        eventTime: entry.eventTime,
        timezone: entry.timezone,
        folderId: entry.folderId ?? null,
        tagIds: entry.tags.map((tag) => tag.id),
        color: entry.color,
      })
      notify(t('entries.duplicate'), 'success')
      navigate(`/entries/${copy.id}/edit`)
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!entry) return
    setBusy(true)
    try {
      await api.deleteEntry(entry.id)
      notify(t('entries.delete'), 'success')
      navigate('/')
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !entry) {
    return <ErrorState message={error || t('errors.notFound')} onRetry={() => void load()} />
  }

  const strokes = (entry.drawing ?? []) as Stroke[]
  const tags = entry.tags ?? ([] as Tag[])

  return (
    <article className="flex flex-col gap-5 pb-10">
      <div className="flex items-center gap-2">
        <IconAction label={t('entries.backToTimeline')} onClick={() => navigate(-1)}>
          <ChevronLeftIcon size={18} />
        </IconAction>
        <div className="ml-auto flex items-center gap-1.5">
          <IconAction
            label={entry.isPinned ? t('entries.unpin') : t('entries.pin')}
            disabled={busy}
            pressed={entry.isPinned}
            onClick={() => void togglePin()}
          >
            <PinIcon size={17} />
          </IconAction>
          <IconAction label={t('entries.duplicate')} disabled={busy} onClick={() => void duplicate()}>
            <CopyIcon size={17} />
          </IconAction>
          <IconAction
            label={t('entries.editEntry')}
            disabled={busy}
            onClick={() => navigate(`/entries/${entry.id}/edit`)}
          >
            <PencilIcon size={17} />
          </IconAction>
          <IconAction
            label={t('entries.delete')}
            disabled={busy}
            danger
            onClick={() => setConfirmDelete(true)}
          >
            <TrashIcon size={17} />
          </IconAction>
        </div>
      </div>

      <header className="flex flex-col gap-2">
        <h1 className="title-large text-ink-strong">
          {entry.title || t('entries.untitled')}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-faint">
          <time dateTime={entry.eventTime}>
            {formatEventDate(entry.eventDate, user?.settings.language)}
          </time>
          <span aria-hidden="true">·</span>
          <span>{formatTime(entry.eventTime, user?.settings.language, entry.timezone)}</span>
          {entry.folderName ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{entry.folderName}</span>
            </>
          ) : null}
          {entry.wordCount > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                {entry.wordCount === 1
                  ? t('entries.oneWord')
                  : t('entries.words', { count: entry.wordCount })}
              </span>
            </>
          ) : null}
        </p>
        {tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {tags.map((tag) => (
              <li key={tag.id}>
                <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink">
                  {tag.name}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </header>

      <div className="card p-5 sm:p-6">
        <RichText document={entry.document} />
      </div>

      {strokes.length > 0 ? (
        <section className="overflow-hidden rounded-2xl bg-paper-raised shadow-sm">
          <DrawingView strokes={strokes} className="block w-full" />
        </section>
      ) : null}

      {entry.media && entry.media.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[0.8125rem] font-semibold tracking-wide text-ink-faint uppercase">
            {t('entries.attachments')}
          </h2>
          <MediaStrip media={entry.media} />
        </section>
      ) : null}

      {entry.location ? (
        <section className="flex items-center gap-2.5 rounded-2xl bg-paper-raised px-3.5 py-3 shadow-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <LocationIcon size={17} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.9375rem] font-medium text-ink">
              {entry.location.name || entry.location.address}
            </p>
            {entry.location.address && entry.location.address !== entry.location.name ? (
              <p className="truncate text-xs text-ink-faint">{entry.location.address}</p>
            ) : null}
          </div>
        </section>
      ) : null}

      {entry.aiMetadata && entry.aiMetadata.length > 0 ? (
        <AIMetadataPanel
          metadata={entry.aiMetadata}
          entryId={entry.id}
          onApplyTags={(names) => {
            void api
              .updateEntry(entry.id, {
                tagNames: names,
                revision: entry.revision,
              })
              .then(() => notify(t('entries.tags'), 'success'))
              .catch((err) => notify(describe(err, t('errors.generic')), 'error'))
          }}
        />
      ) : null}

      <footer className="flex flex-col gap-1 border-t border-line pt-3 text-xs text-ink-faint">
        <span>
          {t('entries.created')}: {formatDateTime(entry.createdAt, user?.settings.language)}
        </span>
        <span>
          {t('entries.updated')}: {formatDateTime(entry.updatedAt, user?.settings.language)}
        </span>
      </footer>

      <ConfirmDialog
        open={confirmDelete}
        title={t('entries.deleteConfirm')}
        description={t('entries.deleteWarning')}
        confirmLabel={t('entries.delete')}
        destructive
        busy={busy}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void remove()}
      />
    </article>
  )
}

/** A round action that stays the same size on a phone, with its name on the tooltip. */
function IconAction({
  label,
  onClick,
  disabled,
  danger,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  pressed?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        'flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50 active:scale-95',
        danger
          ? 'bg-danger-soft text-danger'
          : pressed
            ? 'bg-accent-soft text-accent'
            : 'bg-paper-sunken text-ink hover:bg-line/70',
      )}
    >
      {children}
    </button>
  )
}
