import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { formatTime } from '../../lib/format'
import type { Entry, Media } from '../../lib/types'
import { MediaGrid, splitMedia } from '../media/MediaGrid'
import { FolderIcon, ImageIcon, LocationIcon, PinIcon, VideoIcon } from '../icons'

interface EntryCardProps {
  entry: Entry
  language: string
  /** Zone the clock and the day are shown in. */
  timeZone?: string
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: number) => void
  /** Called with the picture that was tapped. */
  onOpenMedia?: (media: Media, index: number) => void
}

/** The picture that leads the entry, the chosen one when there is one. */
function leadingPicture(entry: Entry, pictures: Media[]): Media[] {
  if (pictures.length === 0) return pictures
  if (!entry.coverMediaId) return pictures
  const cover = pictures.find((item) => item.id === entry.coverMediaId)
  if (!cover) return pictures
  return [cover, ...pictures.filter((item) => item.id !== cover.id)]
}

/**
 * One entry in the timeline.
 *
 * The words lead, the pictures meet the edges of the card, and the small
 * facts sit underneath. Nothing in the card shouts louder than the diary
 * itself.
 */
export function EntryCard({
  entry,
  language,
  timeZone,
  selectable,
  selected,
  onToggleSelect,
  onOpenMedia,
}: EntryCardProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const title = entry.title || t('entries.untitled')
  const excerpt = entry.plainText.trim().slice(0, 220)
  const { pictures, films, files } = splitMedia(entry.media ?? [])
  const ordered = leadingPicture(entry, pictures)
  const from = { from: location.pathname + location.search }
  const shownTags = entry.tags.slice(0, 3)
  const hiddenTags = entry.tags.length - shownTags.length

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-[1.375rem] bg-paper-raised',
        'shadow-[0_1px_2px_rgb(0_0_0/0.045)] transition-shadow duration-200',
        'hover:shadow-[0_3px_14px_rgb(0_0_0/0.07)]',
        selected && 'ring-2 ring-accent',
      )}
    >
      {selectable ? (
        <label className="absolute top-1.5 left-1.5 z-10 flex size-11 cursor-pointer items-center justify-center">
          {/* The box is small, the place to hit it is not. */}
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelect?.(entry.id)}
            className="size-[1.15rem] accent-[var(--accent)]"
            aria-label={t('batch.select')}
          />
        </label>
      ) : null}

      <div
        className={cn(
          'px-4 pt-4',
          ordered.length > 0 ? 'pb-3.5' : 'pb-4',
          selectable && 'pl-12',
        )}
      >
        <Link to={`/entries/${entry.id}`} state={from} className="block">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 flex-1 text-[1.3125rem] leading-[1.25] font-bold tracking-tight text-ink-strong transition-colors group-hover:text-accent-ink">
              {title}
            </h3>
            <time
              dateTime={entry.eventTime}
              className="shrink-0 pt-px text-xs font-medium text-ink-faint tabular-nums"
            >
              {formatTime(entry.eventTime, language, timeZone || entry.timezone)}
            </time>
          </div>
          {excerpt ? (
            <p className="mt-1.5 line-clamp-3 text-[1.0625rem] leading-[1.55] text-ink">
              {excerpt}
            </p>
          ) : null}
        </Link>

        {shownTags.length > 0 ||
        entry.location ||
        entry.folderName ||
        entry.isPinned ||
        films.length > 0 ||
        files.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-ink-faint">
            {shownTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center rounded-full bg-paper-sunken px-2 py-0.5 font-medium text-ink-muted"
              >
                {tag.name}
              </span>
            ))}
            {hiddenTags > 0 ? <span className="tabular-nums">+{hiddenTags}</span> : null}

            {entry.location ? (
              <span className="inline-flex min-w-0 items-center gap-1 text-ink-muted">
                <LocationIcon size={13} className="shrink-0" />
                <span className="max-w-40 truncate">
                  {entry.location.name || entry.location.address}
                </span>
              </span>
            ) : null}

            {entry.folderName ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <FolderIcon size={13} className="shrink-0" />
                <span className="max-w-32 truncate">{entry.folderName}</span>
              </span>
            ) : null}

            {films.length > 0 ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <VideoIcon size={13} />
                {films.length}
              </span>
            ) : null}

            {files.length > 0 ? (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <ImageIcon size={13} />
                {files.length}
              </span>
            ) : null}

            {entry.isPinned ? (
              <span title={t('entries.pinned')} className="text-accent">
                <PinIcon size={13} />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {ordered.length > 0 ? (
        <MediaGrid
          media={ordered}
          bleed
          onOpen={(media, index) => {
            const original = pictures.findIndex((item) => item.id === media.id)
            onOpenMedia?.(media, original === -1 ? index : original)
          }}
        />
      ) : null}
    </article>
  )
}
