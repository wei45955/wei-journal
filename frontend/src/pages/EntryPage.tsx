import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { displayTimezone, formatTime, formatEventDate, formatDateTime, localDateKey } from '../lib/format'
import { useToast } from '../state/toast'
import { useAuth } from '../state/auth'
import { ErrorState, Skeleton } from '../components/ui'
import { ConfirmDialog } from '../components/ui/Dialog'
import { RichText } from '../components/editor/RichText'
import { DrawingView } from '../components/editor/DrawingView'
import { MediaStrip } from '../components/media/MediaViewer'
import { MediaGallery } from '../components/media/MediaViewer'
import { AIMetadataPanel } from '../components/entries/AIMetadataPanel'
import { BackButton, IconButton, TopBar } from '../components/layout/TopBar'
import { Menu } from '../components/layout/Menu'
import { CopyIcon, LocationIcon, MoreIcon, PencilIcon, PinIcon, TrashIcon } from '../components/icons'
import type { Entry, Media, Stroke, Tag } from '../lib/types'

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
  const [gallery, setGallery] = useState<{ items: Media[]; index: number } | null>(null)

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
      <div className="flex flex-col gap-4 pt-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !entry) {
    return (
      <div className="pt-6">
        <ErrorState message={error || t('errors.notFound')} onRetry={() => void load()} />
      </div>
    )
  }

  const strokes = (entry.drawing ?? []) as Stroke[]
  const tags = entry.tags ?? ([] as Tag[])
  const media = entry.media ?? []

  const menuItems = [
    {
      id: 'pin',
      label: entry.isPinned ? t('entries.unpin') : t('entries.pin'),
      icon: <PinIcon size={17} />,
      checked: entry.isPinned,
      onSelect: () => void togglePin(),
    },
    {
      id: 'duplicate',
      label: t('entries.duplicate'),
      icon: <CopyIcon size={17} />,
      onSelect: () => void duplicate(),
    },
    {
      id: 'delete',
      label: t('entries.delete'),
      icon: <TrashIcon size={17} />,
      destructive: true,
      onSelect: () => setConfirmDelete(true),
    },
  ]

  return (
    <article className="animate-page-in flex flex-col gap-5 pb-10">
      <TopBar
        title={entry.title || t('entries.untitled')}
        left={<BackButton label={t('entries.backToTimeline')} onClick={() => navigate(-1)} />}
        actions={
          <>
            <IconButton
              label={t('entries.editEntry')}
              disabled={busy}
              onClick={() => navigate(`/entries/${entry.id}/edit`)}
            >
              <PencilIcon size={19} />
            </IconButton>
            <Menu items={menuItems} label={t('common.more')}>
              {(props) => (
                <IconButton {...props} label={t('common.more')}>
                  <MoreIcon size={20} />
                </IconButton>
              )}
            </Menu>
          </>
        }
      />

      <header className="flex flex-col gap-2">
        <h1 className="title-large text-ink-strong">
          {entry.title || t('entries.untitled')}
        </h1>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-faint">
          <time dateTime={entry.eventTime}>
            {formatEventDate(
              localDateKey(new Date(entry.eventTime), displayTimezone(user?.settings.timezone)),
              user?.settings.language,
            )}
          </time>
          <span aria-hidden="true">·</span>
          <span>
            {formatTime(
              entry.eventTime,
              user?.settings.language,
              displayTimezone(user?.settings.timezone),
            )}
          </span>
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

      {media.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-[0.8125rem] font-semibold tracking-wide text-ink-faint uppercase">
            {t('entries.attachments')}
          </h2>
          <MediaStrip
            media={media}
            onOpen={(_, index) => setGallery({ items: media, index })}
          />
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

      {gallery ? (
        <MediaGallery
          items={gallery.items}
          index={gallery.index}
          onIndexChange={(index) => setGallery({ ...gallery, index })}
          onClose={() => setGallery(null)}
        />
      ) : null}
    </article>
  )
}
