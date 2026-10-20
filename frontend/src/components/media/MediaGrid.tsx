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
  className?: string
}

/**
 * The pictures of an entry in the timeline.
 *
 * One picture is shown at its own size, two sit side by side, and more are
 * arranged as one large picture beside a few smaller ones. The number of
 * pictures is always shown in the corner, so the reader knows what waits
 * behind the first one.
 */
export function MediaGrid({ media, onOpen, className }: MediaGridProps) {
  if (media.length === 0) return null

  if (media.length === 1) {
    return (
      <div className={cn('relative', className)}>
        <button
          type="button"
          onClick={() => onOpen(media[0], 0)}
          className="block w-full overflow-hidden rounded-2xl bg-paper-sunken"
          aria-label={media[0].originalName}
        >
          <Thumb
            media={media[0]}
            className="aspect-[4/3] w-full transition-transform duration-300 active:scale-[1.02]"
          />
        </button>
        <CountBadge count={media.length} />
      </div>
    )
  }

  if (media.length === 2) {
    return (
      <div className={cn('relative grid h-[9.5rem] grid-cols-2 gap-1.5 sm:h-[11rem] sm:max-w-[40rem]', className)}>
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item, index)}
            className="block overflow-hidden rounded-[0.875rem] bg-paper-sunken"
            aria-label={item.originalName}
          >
            <Thumb
              media={item}
              className="transition-transform duration-300 active:scale-[1.03]"
            />
          </button>
        ))}
        <CountBadge count={media.length} />
      </div>
    )
  }

  if (media.length === 4) {
    return (
      <div className={cn('relative grid h-[9.5rem] grid-cols-2 grid-rows-2 gap-1.5 sm:h-[11rem] sm:max-w-[40rem]', className)}>
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item, index)}
            className="block overflow-hidden rounded-[0.875rem] bg-paper-sunken"
            aria-label={item.originalName}
          >
            <Thumb
              media={item}
              className="transition-transform duration-300 active:scale-[1.03]"
            />
          </button>
        ))}
        <CountBadge count={media.length} />
      </div>
    )
  }

  // One large picture beside a few smaller ones. The large one covers the
  // space of four small ones, so the whole group stays compact.
  const small = media.slice(1, 4)
  return (
    <div className={cn('relative grid h-[9.5rem] grid-cols-4 grid-rows-2 gap-1.5 sm:h-[11rem] sm:max-w-[40rem]', className)}>
      <button
        type="button"
        onClick={() => onOpen(media[0], 0)}
        className="col-span-2 row-span-2 block overflow-hidden rounded-[0.875rem] bg-paper-sunken"
        aria-label={media[0].originalName}
      >
        <Thumb
          media={media[0]}
          className="transition-transform duration-300 active:scale-[1.03]"
        />
      </button>

      {small.map((item, index) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onOpen(item, index + 1)}
          className="block overflow-hidden rounded-[0.875rem] bg-paper-sunken"
          aria-label={item.originalName}
        >
          <Thumb
            media={item}
            className="transition-transform duration-300 active:scale-[1.05]"
          />
        </button>
      ))}

      <CountBadge count={media.length} />
    </div>
  )
}

/** The number of the pictures of the entry, in the corner of the group. */
function CountBadge({ count }: { count: number }) {
  const { t } = useTranslation()
  if (count < 2) return null
  return (
    <span
      className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[0.6875rem] font-semibold text-white backdrop-blur-sm"
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
