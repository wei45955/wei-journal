import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { formatTime } from '../../lib/format'
import type { Entry, Media } from '../../lib/types'
import { MediaGrid, splitMedia } from '../media/MediaGrid'
import { ImageIcon, LocationIcon, PinIcon } from '../icons'

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

/** One entry in the timeline. */
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
  const title = entry.title || t('entries.untitled')
  const excerpt = entry.plainText.slice(0, 220)
  const { pictures, films, files } = splitMedia(entry.media ?? [])
  const ordered = leadingPicture(entry, pictures)

  return (
    <article
      className={cn(
        'group relative rounded-2xl bg-paper-raised p-4 transition-shadow duration-200',
        'shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:shadow-[0_2px_10px_rgb(0_0_0/0.07)]',
        selected && 'ring-2 ring-accent',
      )}
    >
      {selectable ? (
        <label className="absolute top-3.5 left-3.5 z-10 flex size-6 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelect?.(entry.id)}
            className="size-[1.15rem] accent-[var(--accent)]"
            aria-label={t('batch.select')}
          />
        </label>
      ) : null}

      <Link to={`/entries/${entry.id}`} className={cn('block', selectable && 'pl-8')}>
        <h3 className="text-[1.375rem] leading-tight font-bold tracking-tight text-ink-strong transition-colors group-hover:text-accent-ink">
          {title}
        </h3>
        {excerpt ? (
          <p className="mt-1.5 line-clamp-4 text-[1.0625rem] leading-relaxed text-ink">{excerpt}</p>
        ) : null}
      </Link>

      {ordered.length > 0 ? (
        <div className={cn('mt-3', selectable && 'pl-8')}>
          <MediaGrid
            media={ordered}
            onOpen={(media, index) => {
              const original = pictures.findIndex((item) => item.id === media.id)
              onOpenMedia?.(media, original === -1 ? index : original)
            }}
          />
        </div>
      ) : null}

      {films.length > 0 || files.length > 0 ? (
        <div className={cn('mt-2 flex items-center gap-3 text-sm text-ink-muted', selectable && 'pl-8')}>
          {films.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden="true">
                <rect x="3" y="6" width="12.5" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
                <path d="M15.5 10.5l5-3v9l-5-3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              {films.length}
            </span>
          ) : null}
          {files.length > 0 ? (
            <span className="inline-flex items-center gap-1">
              <ImageIcon size={14} />
              {files.length}
            </span>
          ) : null}
        </div>
      ) : null}

      {entry.tags.length > 0 || entry.location ? (
        <div className={cn('mt-3 flex flex-wrap items-center gap-1.5', selectable && 'pl-8')}>
          {entry.tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-ink"
            >
              {tag.name}
            </span>
          ))}
          {entry.location ? (
            <span className="inline-flex items-center gap-1 text-sm text-ink-muted">
              <LocationIcon size={15} />
              {entry.location.name || entry.location.address}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className={cn('mt-3 flex items-center gap-2 text-sm text-ink-faint', selectable && 'pl-8')}>
        <time dateTime={entry.eventTime} className="font-medium tabular-nums">
          {formatTime(entry.eventTime, language, timeZone || entry.timezone)}
        </time>
        {entry.isPinned ? (
          <span title={t('entries.pinned')} className="text-accent">
            <PinIcon size={14} />
          </span>
        ) : null}
        {entry.folderName ? <span className="truncate">{entry.folderName}</span> : null}
      </div>
    </article>
  )
}
