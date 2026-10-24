import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { Media } from '../../lib/types'
import { LiveIcon, VideoIcon } from '../../ui/icons'
import { isFilm, Thumb } from './Thumb'

/**
 * The pictures of an entry.
 *
 * One picture stands on its own, whole and quiet: it keeps its own shape and
 * is never taller than half the screen, so the words of the entry stay the
 * subject.
 *
 * More than one lie side by side in a strip that can be moved along with a
 * finger. Every picture in the strip sits in the same frame, so the row does
 * not jump about while it is read. The frame is four to three, which is the
 * proportion of a picture in the middle of a page; sixteen to nine belongs
 * to a banner, and reads as an advertisement rather than a photograph.
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
  if (items.length === 0) return null
  if (items.length === 1) return <Plate media={items[0]} onOpen={() => onOpen?.(0)} className={className} />
  return <Strip items={items} onOpen={onOpen} className={className} />
}

/** The one picture of an entry, whole and centred. */
function Plate({ media, onOpen, className }: { media: Media; onOpen: () => void; className?: string }) {
  const { t } = useTranslation()
  const source = media.hasPreview ? media.previewUrl : media.url
  return (
    <figure className={cn('mb-7', className)}>
      <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-[18px] bg-well">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            onOpen()
          }}
          aria-label={media.originalName || t('media.open')}
          className="press flex items-center justify-center"
        >
          <img
            src={source}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="max-h-[52svh] max-w-full object-contain"
          />
        </button>
        <Badge media={media} />
      </div>
    </figure>
  )
}

/** Several pictures, side by side, in one frame. */
function Strip({
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

  return (
    <figure className={cn('mb-7', className)}>
      <div
        ref={strip}
        className="-mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 no-scrollbar sm:mx-0 sm:px-0"
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
            className="relative w-[min(86%,24rem)] shrink-0 snap-center overflow-hidden rounded-[18px] bg-well"
            style={{ aspectRatio: '4 / 3' }}
          >
            <Thumb media={media} large />
            <Badge media={media} />
          </button>
        ))}
      </div>
      <figcaption className="tnum mt-2 text-center text-[0.75rem] text-ink-3">
        {t('media.position', { index: current + 1, total: items.length })}
      </figcaption>
    </figure>
  )
}

/** The mark of a picture that is more than a picture. */
function Badge({ media }: { media: Media }) {
  const { t } = useTranslation()
  if (isFilm(media)) {
    return (
      <span className="absolute bottom-2.5 left-2.5 flex size-7 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
        <VideoIcon size={15} />
      </span>
    )
  }
  if (media.kind === 'live-still') {
    return (
      <span className="absolute top-2.5 left-2.5 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[0.6875rem] font-medium text-white backdrop-blur-sm">
        <LiveIcon size={13} />
        {t('media.live')}
      </span>
    )
  }
  return null
}
