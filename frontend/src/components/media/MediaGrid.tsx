import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { Media } from '../../lib/types'
import { ImageIcon } from '../icons'
import { Thumb } from './Thumb'

interface MediaGridProps {
  /** The pictures of the entry. */
  media: Media[]
  /** Called with the picture that was tapped. */
  onOpen: (media: Media, index: number) => void
  /** Runs the pictures to the edges of the card, without an inner frame. */
  bleed?: boolean
  className?: string
}

/**
 * The pictures of an entry in the timeline.
 *
 * One picture is shown at its own size, two sit side by side, three make a
 * large picture beside two small ones, and four or more become a quiet
 * square mosaic. The number of pictures is always shown in the corner, so
 * the reader knows what waits behind the first one.
 */
export function MediaGrid({ media, onOpen, bleed = false, className }: MediaGridProps) {
  if (media.length === 0) return null

  const frame = bleed ? '' : 'rounded-[0.875rem]'
  const gap = bleed ? 'gap-0.5' : 'gap-1.5'

  if (media.length === 1) {
    return (
      <div className={cn('relative', className)}>
        <button
          type="button"
          onClick={() => onOpen(media[0], 0)}
          className={cn(
            'block w-full overflow-hidden bg-paper-sunken',
            bleed ? '' : 'rounded-2xl',
          )}
          aria-label={media[0].originalName}
        >
          <Thumb
            media={media[0]}
            className="aspect-[4/3] w-full transition-transform duration-300 active:scale-[1.015]"
          />
        </button>
        <CountBadge count={media.length} inset={bleed} />
      </div>
    )
  }

  if (media.length === 2) {
    return (
      <div className={cn('relative grid h-[10.5rem] grid-cols-2 sm:h-48', gap, className)}>
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item, index)}
            className={cn('block overflow-hidden bg-paper-sunken', frame)}
            aria-label={item.originalName}
          >
            <Thumb
              media={item}
              className="size-full transition-transform duration-300 active:scale-[1.02]"
            />
          </button>
        ))}
        <CountBadge count={media.length} inset={bleed} />
      </div>
    )
  }

  if (media.length === 3) {
    return (
      <div
        className={cn(
          'relative grid h-[10.5rem] grid-cols-3 grid-rows-2 sm:h-48',
          gap,
          className,
        )}
      >
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item, index)}
            className={cn(
              'block overflow-hidden bg-paper-sunken',
              frame,
              index === 0 && 'col-span-2 row-span-2',
            )}
            aria-label={item.originalName}
          >
            <Thumb
              media={item}
              className="size-full transition-transform duration-300 active:scale-[1.02]"
            />
          </button>
        ))}
        <CountBadge count={media.length} inset={bleed} />
      </div>
    )
  }

  // Four or more: a calm square mosaic. The badge carries the rest.
  return (
    <div
      className={cn(
        'relative grid h-[13.5rem] grid-cols-2 grid-rows-2 sm:h-64',
        gap,
        className,
      )}
    >
      {media.slice(0, 4).map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item, index)}
          className={cn('block overflow-hidden bg-paper-sunken', frame)}
          aria-label={item.originalName}
        >
          <Thumb
            media={item}
            className="size-full transition-transform duration-300 active:scale-[1.02]"
          />
        </button>
      ))}
      <CountBadge count={media.length} inset={bleed} />
    </div>
  )
}

/** The number of the pictures of the entry, in the corner of the group. */
function CountBadge({ count, inset }: { count: number; inset: boolean }) {
  const { t } = useTranslation()
  if (count < 2) return null
  return (
    <span
      className={cn(
        'pointer-events-none absolute inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[0.6875rem] font-semibold text-white backdrop-blur-sm',
        inset ? 'right-3 bottom-3' : 'right-2 bottom-2',
      )}
      aria-label={t('media.photoCount', { count })}
    >
      <ImageIcon size={12} />
      {count}
    </span>
  )
}

/** The pictures and the films of an entry, in the order they were added. */
export function splitMedia(media: Media[]) {
  const pictures = media.filter((item) => item.kind === 'image' || item.kind === 'live-still')
  const films = media.filter((item) => item.kind === 'video' || item.kind === 'live-motion')
  const files = media.filter(
    (item) => item.kind !== 'image' && item.kind !== 'live-still' && item.kind !== 'video' && item.kind !== 'live-motion',
  )
  return { pictures, films, files }
}
