import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { Media } from '../../lib/types'
import { LiveIcon, VideoIcon } from '../../ui/icons'
import { isFilm, Thumb } from './Thumb'

/**
 * The shape of a picture, held between two limits so a very tall or very
 * wide photograph still reads as a photograph and never becomes a banner.
 */
function shapeOf(media: Media) {
  const ratio = media.width && media.height ? media.width / media.height : 4 / 3
  return Math.min(Math.max(ratio, 0.62), 1.75)
}

/**
 * The pictures of an entry, laid out as a strip that can be swiped.
 *
 * One picture stands on its own, centred and whole, with the paper showing
 * at its sides. More than one lie side by side and are moved along with a
 * finger, each one whole and never cropped. The strip runs to the edges of
 * the screen so the next picture is already waiting at the border.
 */
export function Gallery({
  items,
  onOpen,
  className,
}: {
  items: Media[]
  onOpen?: (index: number) => void
  className?: string
}) {
  const { t } = useTranslation()
  const strip = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)

  const onScroll = useCallback(() => {
    const element = strip.current
    if (!element) return
    const first = element.firstElementChild as HTMLElement | null
    if (!first) return
    const step = first.offsetWidth + 8
    const offset = element.scrollLeft + element.clientWidth / 2 - first.offsetWidth / 2
    setCurrent(Math.min(items.length - 1, Math.max(0, Math.round(offset / step))))
  }, [items.length])

  useEffect(() => {
    const element = strip.current
    if (!element) return
    onScroll()
    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [onScroll])

  if (items.length === 0) return null

  const single = items.length === 1

  return (
    <figure className={cn('mb-7', className)}>
      <div
        ref={strip}
        className={cn(
          '-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 no-scrollbar sm:mx-0 sm:px-0',
          single && 'justify-center',
        )}
      >
        {items.map((media, index) => (
          <button
            key={media.id}
            type="button"
            onClick={(event) => {
              event.preventDefault()
              onOpen?.(index)
            }}
            aria-label={media.originalName || t('media.open')}
            className="relative shrink-0 snap-center overflow-hidden rounded-[18px] bg-well"
            style={{ width: single ? 'min(88%, 30rem)' : 'min(86%, 26rem)', aspectRatio: String(shapeOf(media)) }}
          >
            <Thumb media={media} large />
            {isFilm(media) ? (
              <span className="absolute bottom-2.5 left-2.5 flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
                <VideoIcon size={15} />
              </span>
            ) : media.kind === 'live-still' ? (
              <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[0.6875rem] font-medium text-white backdrop-blur-sm">
                <LiveIcon size={13} />
                {t('media.live')}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {!single ? (
        <figcaption className="tnum mt-2 text-center text-[0.75rem] text-ink-3">
          {t('media.position', { index: current + 1, total: items.length })}
        </figcaption>
      ) : null}
    </figure>
  )
}
