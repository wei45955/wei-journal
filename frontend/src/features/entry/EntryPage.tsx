import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { prime, scan, useResource } from '../../lib/cache'
import { cn } from '../../lib/cn'
import { dateTimePattern, dayParts, displayTimezone, formatBytes, formatDateTime, formatTime, localDateKey, longDate } from '../../lib/format'
import type { Entry } from '../../lib/types'
import { usePrefs } from '../../state/auth'
import { afterEntryChange } from '../../state/library'
import { useToast } from '../../state/toast'
import { BackButton, TopBar, useBack } from '../../shell/TopBar'
import { ErrorState, IconButton, Skeleton } from '../../ui'
import { Menu } from '../../ui/Popover'
import { ConfirmSheet } from '../../ui/Sheet'
import { CopyIcon, DownloadIcon, FileIcon, FolderIcon, MoreIcon, PenIcon, PinIcon, PlaceIcon, TrashIcon } from '../../ui/icons'
import { Seal, SealMark } from '../../ui/Seal'
import { Gallery } from '../media/Gallery'
import { splitMedia } from '../media/Thumb'
import { Viewer } from '../media/Viewer'
import { SketchView } from '../sketch/SketchView'
import type { EntryPage as ListPage } from '../timeline/useEntryList'
import { AiNotes } from './AiNotes'
import { RichText } from './RichText'

export function EntryPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const back = useBack('/')
  const { entryId } = useParams()
  const id = Number(entryId)
  const { language, zone: zoneSetting, dateFormat } = usePrefs()
  const zone = displayTimezone(zoneSetting)
  const { notify, describe } = useToast()

  // The entry is usually already in a list that was just on screen, so it
  // can be drawn at once while the full record arrives.
  const seed = useMemo(
    () => scan<ListPage>('entries:').flatMap((page) => page.items).find((entry) => entry.id === id),
    [id],
  )
  const resource = useResource<Entry>(Number.isFinite(id) ? `entry:${id}` : null, () => api.entry(id))
  const entry = resource.data ?? seed

  const [more, setMore] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [viewer, setViewer] = useState<number | null>(null)
  const moreRef = useRef<HTMLButtonElement>(null)

  if (!entry) {
    return (
      <>
        <TopBar leading={<BackButton />} />
        {resource.error ? (
          <ErrorState message={describe(resource.error)} onRetry={() => void resource.reload()} />
        ) : (
          <div className="flex flex-col gap-3 pt-4" aria-busy="true">
            <Skeleton className="h-4 w-40 rounded" />
            <Skeleton className="h-10 w-3/4 rounded-lg" />
            <Skeleton className="mt-4 aspect-[4/3] w-full rounded-xl" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-5/6 rounded" />
          </div>
        )}
      </>
    )
  }

  const current = entry
  const { visual, files } = splitMedia(current.media ?? [], current.coverMediaId)
  const day = localDateKey(new Date(current.eventTime), zone)
  const place = current.location?.name || current.location?.address

  async function togglePin() {
    try {
      const updated = await api.updateEntry(current.id, { isPinned: !current.isPinned })
      prime(`entry:${current.id}`, updated)
      afterEntryChange()
      notify(updated.isPinned ? t('entry.pinnedToast') : t('entry.unpinnedToast'))
    } catch (error) {
      notify(describe(error), 'error')
    }
  }

  async function duplicate() {
    try {
      const copy = await api.createEntry({
        title: current.title,
        document: JSON.stringify(current.document ?? { type: 'doc', content: [] }),
        drawing: JSON.stringify(current.drawing ?? []),
        eventTime: current.eventTime,
        timezone: current.timezone,
        folderId: current.folderId ?? null,
        tagIds: current.tags.map((tag) => tag.id),
        color: current.color,
      })
      afterEntryChange()
      notify(t('entry.duplicated'))
      navigate(`/entry/${copy.id}`)
    } catch (error) {
      notify(describe(error), 'error')
    }
  }

  async function remove() {
    setBusy(true)
    try {
      await api.deleteEntry(current.id)
      notify(t('entry.deleted'))
      back()
      window.setTimeout(afterEntryChange, 0)
    } catch (error) {
      notify(describe(error), 'error')
      setBusy(false)
    }
  }

  return (
    <article>
      <TopBar
        title={current.title || longDate(day, language)}
        leading={<BackButton />}
        trailing={
          <>
            <IconButton label={t('entry.edit')} onClick={() => navigate(`/entry/${current.id}/edit`, { replace: false })}>
              <PenIcon size={21} />
            </IconButton>
            <IconButton ref={moreRef} label={t('nav.more')} onClick={() => setMore((open) => !open)}>
              <MoreIcon size={22} />
            </IconButton>
          </>
        }
      />

      <header className="pt-2 pb-6">
        <div className="flex items-start gap-3">
          <Seal size={36} muted label={longDate(day, language)}>
            {dayParts(day, language).day}
          </Seal>
          <div className="min-w-0 pt-0.5">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink-2">
              <Link to={`/archive?day=${day}`} className="press rounded font-medium text-ink">
                {longDate(day, language)}
              </Link>
              <time dateTime={current.eventTime} className="tnum text-ink-3">
                {formatTime(current.eventTime, language, zone)}
              </time>
            </p>
            {current.isPinned ? (
              <p className="caption mt-1 flex items-center gap-1.5 text-seal">
                <SealMark size={7} />
                {t('timeline.pinned')}
              </p>
            ) : null}
          </div>
        </div>

        {current.title ? <h1 className="display-2 mt-6 text-ink">{current.title}</h1> : null}

        {current.folderName || place || current.tags.length ? (
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-2">
            {current.folderName ? (
              <Link to={`/folder/${current.folderId}`} className="flex items-center gap-1.5 hover:text-ink">
                <FolderIcon size={16} className="text-ink-3" />
                {current.folderName}
              </Link>
            ) : null}
            {place ? (
              <Link to={`/places?entry=${current.id}`} className="flex min-w-0 items-center gap-1.5 hover:text-ink">
                <PlaceIcon size={16} className="shrink-0 text-ink-3" />
                <span className="truncate">{place}</span>
              </Link>
            ) : null}
            {current.tags.map((tag) => (
              <span key={tag.id} className="text-accent">
                #{tag.name}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      {visual.length > 0 ? <Gallery items={visual} onOpen={setViewer} /> : null}

      <RichText document={current.document} />

      {current.drawing?.length ? (
        <figure className="mt-8 overflow-hidden rounded-xl bg-leaf p-3 hairline">
          <SketchView strokes={current.drawing} label={t('entry.sketch')} />
        </figure>
      ) : null}

      {files.length > 0 ? (
        <section className="mt-8">
          <h2 className="title-3 mb-2 text-ink-2">{t('entry.files')}</h2>
          <ul className="overflow-hidden rounded-xl bg-leaf hairline">
            {files.map((file, index) => (
              <li key={file.id} className={cn(index > 0 && 'border-t border-rule')}>
                <a
                  href={file.url}
                  download={file.originalName}
                  className="flex min-h-14 items-center gap-3 px-4 hover:bg-well active:bg-well"
                >
                  <FileIcon size={22} className="shrink-0 text-ink-3" />
                  <span className="min-w-0 flex-1">
                    <span className="body-2 block truncate text-ink">{file.originalName}</span>
                    <span className="caption block text-ink-3">{formatBytes(file.size)}</span>
                  </span>
                  <DownloadIcon size={20} className="shrink-0 text-accent" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {current.wordCount > 0 ? (
        <div className="mt-8 flex justify-end" aria-hidden="true">
          <Seal size={28} muted>
            记
          </Seal>
        </div>
      ) : null}

      <div className="mt-8">
        <AiNotes entry={current} />
      </div>

      <footer className="caption mt-10 border-t border-rule pt-4 text-ink-3">
        {current.wordCount > 0 ? <p>{t('entry.words', { count: current.wordCount })}</p> : null}
        <p>{t('entry.created', { date: formatDateTime(current.createdAt, language, dateTimePattern(dateFormat), zone) })}</p>
        {current.updatedAt !== current.createdAt ? (
          <p>{t('entry.updated', { date: formatDateTime(current.updatedAt, language, dateTimePattern(dateFormat), zone) })}</p>
        ) : null}
      </footer>

      <Menu
        open={more}
        onClose={() => setMore(false)}
        anchorRef={moreRef}
        label={t('nav.more')}
        items={[
          {
            id: 'pin',
            label: current.isPinned ? t('entry.unpin') : t('entry.pin'),
            icon: <PinIcon size={21} />,
            onSelect: () => void togglePin(),
          },
          { id: 'copy', label: t('entry.duplicate'), icon: <CopyIcon size={21} />, onSelect: () => void duplicate() },
          {
            id: 'delete',
            label: t('entry.delete'),
            icon: <TrashIcon size={21} />,
            destructive: true,
            onSelect: () => setConfirmDelete(true),
          },
        ]}
      />
      <ConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('entry.deleteTitle')}
        body={t('entry.deleteBody')}
        confirmLabel={t('entry.delete')}
        destructive
        busy={busy}
        onConfirm={() => void remove()}
      />

      {viewer !== null ? (
        <Viewer items={visual} all={current.media} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      ) : null}
    </article>
  )
}
