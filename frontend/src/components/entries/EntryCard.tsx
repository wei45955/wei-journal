import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { formatTime } from '../../lib/format'
import type { Entry } from '../../lib/types'
import { ImageIcon, LocationIcon, PinIcon, VideoIcon } from '../icons'

interface EntryCardProps {
  entry: Entry
  language: string
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: (id: number) => void
}

/** One entry in the timeline. */
export function EntryCard({ entry, language, selectable, selected, onToggleSelect }: EntryCardProps) {
  const { t } = useTranslation()
  const title = entry.title || t('entries.untitled')
  const excerpt = entry.plainText.slice(0, 220)
  const images = entry.media.filter((m) => m.kind === 'image' || m.kind === 'live-still')
  const videos = entry.media.filter((m) => m.kind === 'video')

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

      <div className={cn('flex items-center gap-2', selectable && 'pl-8')}>
        <time dateTime={entry.eventTime} className="text-xs font-medium text-ink-faint tabular-nums">
          {formatTime(entry.eventTime, language, entry.timezone)}
        </time>
        {entry.isPinned ? (
          <span title={t('entries.pinned')} className="text-accent">
            <PinIcon size={13} />
          </span>
        ) : null}
        {entry.folderName ? (
          <span className="truncate text-xs text-ink-faint">{entry.folderName}</span>
        ) : null}
      </div>

      <Link to={`/entries/${entry.id}`} className={cn('mt-1 block', selectable && 'pl-8')}>
        <h3 className="text-[1.0625rem] leading-snug font-semibold text-ink-strong transition-colors group-hover:text-accent-ink">
          {title}
        </h3>
        {excerpt ? (
          <p className="mt-1.5 line-clamp-3 text-[0.9375rem] leading-relaxed text-ink-muted">
            {excerpt}
          </p>
        ) : null}
      </Link>

      {images.length > 0 || videos.length > 0 ? (
        <div className={cn('mt-3 flex gap-1.5 overflow-hidden', selectable && 'pl-8')}>
          {images.slice(0, 4).map((media) => (
            <img
              key={media.id}
              src={media.hasThumb ? media.thumbUrl : media.url}
              alt={media.originalName}
              loading="lazy"
              decoding="async"
              className="size-[4.5rem] shrink-0 rounded-xl bg-paper-sunken object-cover"
            />
          ))}
          {videos.length > 0 ? (
            <div className="flex size-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-paper-sunken text-ink-faint">
              <VideoIcon size={20} />
            </div>
          ) : null}
          {images.length + videos.length > 4 ? (
            <div className="flex size-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-paper-sunken text-xs font-medium text-ink-muted">
              +{images.length + videos.length - 4}
            </div>
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
            <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
              <LocationIcon size={13} />
              {entry.location.name || entry.location.address}
            </span>
          ) : null}
          {entry.media.length > 0 && images.length === 0 && videos.length === 0 ? (
            <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
              <ImageIcon size={13} />
              {entry.media.length}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
