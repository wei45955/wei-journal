import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { formatTime } from '../../lib/format'
import type { Entry } from '../../lib/types'
import { FileIcon, PinIcon, PlaceIcon } from '../../ui/icons'
import { Mosaic } from '../media/Mosaic'
import { splitMedia } from '../media/Thumb'
import { SketchView } from '../sketch/SketchView'

interface EntryCardProps {
  entry: Entry
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
        className="overflow-hidden rounded-t-[20px]"
      />
    ) : null

  const body = (
    <>
      {sketch ? (
        <div className="border-b border-rule bg-paper/50 px-6 py-2">
          <SketchView strokes={sketch} className="mx-auto block aspect-[4/3] max-h-44 w-full" />
        </div>
      ) : null}

      <div className="px-[18px] pt-3.5 pb-4">
        <div className="flex items-baseline gap-3">
          {title ? (
            <h3 className="min-w-0 flex-1 font-serif text-[1.1875rem] leading-snug font-medium text-ink [font-variation-settings:'opsz'_24]">
              {title}
            </h3>
          ) : (
            <span className="flex-1" />
          )}
          <time dateTime={entry.eventTime} className="tnum shrink-0 text-[0.8125rem] text-ink-3">
            {formatTime(entry.eventTime, language, zone)}
          </time>
        </div>

        {excerpt ? (
          <p
            className={cn(
              'font-serif text-[1rem] leading-[1.6] text-ink-2',
              title ? 'mt-1 line-clamp-3' : 'mt-0.5 line-clamp-4 text-ink',
            )}
          >
            {excerpt}
          </p>
        ) : !title && visual.length === 0 && !sketch ? (
          <p className="font-serif text-[1rem] text-ink-3 italic">{t('timeline.untitled')}</p>
        ) : null}

        {place || entry.tags.length || files.length || entry.isPinned || entry.folderName ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[0.8125rem] text-ink-3">
            {entry.isPinned ? (
              <span className="flex items-center text-accent" title={t('timeline.pinned')}>
                <PinIcon size={15} />
                <span className="sr-only">{t('timeline.pinned')}</span>
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
              <span key={tag.id} className="max-w-[8rem] truncate text-accent/85">
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
    'relative block overflow-hidden rounded-[20px] bg-leaf text-left shadow-[0_1px_2px_rgb(23_32_51/0.05)]',
    'transition-[transform,box-shadow] duration-200 active:scale-[0.985]',
    selected && 'shadow-[0_0_0_2px_var(--wj-accent)]',
  )

  if (selecting) {
    return (
      <button type="button" aria-pressed={selected} onClick={() => onToggle?.(entry.id)} className={cn(frame, 'w-full')}>
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
    <article className={frame}>
      {pictures}
      <Link to={`/entry/${entry.id}`} className="block rounded-b-[20px]">
        {body}
      </Link>
    </article>
  )
})
