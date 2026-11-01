import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { formatTime } from '../../lib/format'
import type { Entry } from '../../lib/types'
import { FileIcon, PlaceIcon } from '../../ui/icons'
import { SealMark } from '../../ui/Seal'
import { Mosaic } from '../media/Mosaic'
import { splitMedia } from '../media/Thumb'
import { SketchView } from '../sketch/SketchView'

interface EntryCardProps {
  entry: Entry
  /** Where the card sits in its day, so the day can arrive one line at a time. */
  index?: number
  language: string
  zone: string
  selecting?: boolean
  selected?: boolean
  onToggle?: (id: number) => void
  onOpenMedia?: (entry: Entry, index: number) => void
}

/**
 * One entry in the journal. The pictures run to the edges of the leaf, the
 * words sit underneath in the reading face, and the small facts close it.
 */
export const EntryCard = memo(function EntryCard({
  entry,
  index = 0,
  language,
  zone,
  selecting,
  selected,
  onToggle,
  onOpenMedia,
}: EntryCardProps) {
  const { t } = useTranslation()
  const { visual, files } = splitMedia(entry.media ?? [], entry.coverMediaId)
  const excerpt = entry.plainText.replace(/\s+/g, ' ').trim()
  const title = entry.title.trim()
  const sketch = entry.drawing?.length && visual.length === 0 ? entry.drawing : null
  const place = entry.location?.name || entry.location?.address

  const pictures =
    visual.length > 0 ? (
      <Mosaic
        items={visual}
        onOpen={selecting ? undefined : (index) => onOpenMedia?.(entry, index)}
        className="overflow-hidden"
      />
    ) : null

  const body = (
    <>
      {sketch ? (
        <div className="bg-paper/60 px-4 py-2 sm:px-6">
          <SketchView strokes={sketch} className="mx-auto block aspect-[4/3] max-h-44 w-full" />
        </div>
      ) : null}

      <div className="px-4 pt-4 pb-4 sm:px-6 sm:pt-5 sm:pb-5">
        <div className="flex items-baseline gap-3">
          {title ? (
            <h3 className="heading-3 min-w-0 flex-1 text-ink">
              {title}
            </h3>
          ) : (
            <span className="flex-1" />
          )}
          <time dateTime={entry.eventTime} className="tnum shrink-0 text-xs text-ink-3">
            {formatTime(entry.eventTime, language, zone)}
          </time>
        </div>

        {excerpt ? (
          <p
            className={cn(
              'entry-excerpt',
              title ? 'mt-1 line-clamp-3' : 'line-clamp-4 text-ink',
            )}
          >
            {excerpt}
          </p>
        ) : !title && visual.length === 0 && !sketch ? (
          <p className="entry-excerpt text-ink-3">{t('timeline.untitled')}</p>
        ) : null}

        {place || entry.tags.length || files.length || entry.isPinned || entry.folderName ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-3">
            {entry.isPinned ? (
              <span className="flex items-center gap-1.5 text-seal" title={t('timeline.pinned')}>
                <SealMark size={7} />
                <span>{t('timeline.pinned')}</span>
              </span>
            ) : null}
            {place ? (
              <span className="flex min-w-0 items-center gap-1">
                <PlaceIcon size={14} className="shrink-0" />
                <span className="max-w-[11rem] truncate">{place}</span>
              </span>
            ) : null}
            {files.length ? (
              <span className="tnum flex items-center gap-1">
                <FileIcon size={14} />
                {files.length}
              </span>
            ) : null}
            {entry.tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className="max-w-[8rem] truncate text-accent">
                #{tag.name}
              </span>
            ))}
            {entry.tags.length > 3 ? <span className="tnum">+{entry.tags.length - 3}</span> : null}
          </div>
        ) : null}
      </div>
    </>
  )

  const frame = cn(
    'relative block overflow-hidden rounded-xl bg-leaf text-left hairline',
    'transition-transform duration-200 active:scale-[0.99] sm:hover:-translate-y-px',
    'animate-reveal',
    selected && 'shadow-[0_0_0_2px_var(--wj-accent)]',
  )
  // The cards of a day arrive one after the other, but only the first few:
  // a long list must not take its time to show.
  const arrive = { animationDelay: `${Math.min(index, 8) * 26}ms` }

  if (selecting) {
    return (
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onToggle?.(entry.id)}
        className={cn(frame, 'w-full')}
        style={arrive}
      >
        {pictures ? <div className="pointer-events-none">{pictures}</div> : null}
        {body}
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-3 right-3 flex size-7 items-center justify-center rounded-full border-2 transition-colors',
            selected ? 'border-accent bg-accent text-accent-on' : 'border-white/90 bg-black/15 backdrop-blur-sm',
          )}
        >
          {selected ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : null}
        </span>
      </button>
    )
  }

  return (
    <article className={frame} style={arrive}>
      {pictures}
      <Link to={`/entry/${entry.id}`} className="block">
        {body}
      </Link>
    </article>
  )
})
