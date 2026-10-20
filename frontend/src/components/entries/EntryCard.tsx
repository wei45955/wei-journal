import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { formatTime } from '../../lib/format'
import type { Entry } from '../../lib/types'
import { Badge } from '../ui'
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
        'group relative rounded-lg border bg-paper-raised p-4 transition-shadow duration-150',
        'hover:shadow-[0_1px_12px_rgb(35_32_27/0.06)]',
        selected ? 'border-accent ring-1 ring-accent/30' : 'border-line',
      )}
    >
      {selectable ? (
        <label className="absolute top-3 left-3 z-10 flex size-6 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={Boolean(selected)}
            onChange={() => onToggleSelect?.(entry.id)}
            className="size-4 accent-[var(--accent)]"
            aria-label={t('batch.select')}
          />
        </label>
      ) : null}

      <div className={cn('flex items-baseline gap-2', selectable && 'pl-7')}>
        <time
          dateTime={entry.eventTime}
          className="font-mono text-xs tabular-nums text-ink-faint"
        >
          {formatTime(entry.eventTime, language)}
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

      <Link
        to={`/entries/${entry.id}`}
        className={cn('mt-1 block', selectable && 'pl-7')}
      >
        <h3 className="font-serif text-lg leading-snug text-ink-strong transition-colors group-hover:text-accent-ink">
          {title}
        </h3>
        {excerpt ? (
          <p className="mt-1.5 line-clamp-3 text-[0.9375rem] text-ink-muted">{excerpt}</p>
        ) : null}
      </Link>

      {images.length > 0 || videos.length > 0 ? (
        <div className={cn('mt-3 flex gap-1.5 overflow-hidden', selectable && 'pl-7')}>
          {images.slice(0, 4).map((media) => (
            <img
              key={media.id}
              src={media.hasThumb ? media.thumbUrl : media.url}
              alt={media.originalName}
              loading="lazy"
              decoding="async"
              className="size-16 shrink-0 rounded-md border border-line object-cover"
            />
          ))}
          {videos.length > 0 ? (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-line bg-paper-sunken text-ink-faint">
              <VideoIcon size={20} />
            </div>
          ) : null}
          {images.length + videos.length > 4 ? (
            <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-line bg-paper-sunken text-xs text-ink-muted">
              +{images.length + videos.length - 4}
            </div>
          ) : null}
        </div>
      ) : null}

      {entry.tags.length > 0 || entry.location ? (
        <div className={cn('mt-3 flex flex-wrap items-center gap-1.5', selectable && 'pl-7')}>
          {entry.tags.map((tag) => (
            <Badge key={tag.id} tone="accent">
              {tag.name}
            </Badge>
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
