import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { formatBytes } from '../../lib/format'
import { lockBodyScroll } from '../../lib/scrollLock'
import type { Media } from '../../lib/types'
import { Button } from '../ui'
import { CloseIcon, DownloadIcon, FileIcon } from '../icons'
import { Thumb } from './Thumb'

const MAX_SCALE = 4

interface ZoomState {
  scale: number
  x: number
  y: number
}

const RESET: ZoomState = { scale: 1, x: 0, y: 0 }

/** The distance between two touch points. */
function distance(touches: React.TouchList): number {
  const [a, b] = [touches[0], touches[1]]
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

function midpoint(touches: React.TouchList): { x: number; y: number } {
  const [a, b] = [touches[0], touches[1]]
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
}

/** Whether the file is a picture. */
function isPicture(media: Media): boolean {
  return media.kind === 'image' || media.kind === 'live-still'
}

/** Whether the file is a film. */
function isFilm(media: Media): boolean {
  return media.kind === 'video' || media.kind === 'live-motion'
}

/**
 * A full screen preview of one attachment. A photograph can be pinched,
 * dragged and double tapped to zoom, without the page around it ever zooming.
 *
 * The picture is drawn in the document itself, so it always covers the
 * whole screen and never sits behind the bars of the page.
 */
export function MediaViewer({
  media,
  onClose,
  motion,
}: {
  media: Media | null
  onClose: () => void
  /** The motion component of a Live Photo, when one exists. */
  motion?: Media | null
}) {
  if (!media) return null
  return createPortal(
    <MediaOverlay
      items={[media]}
      index={0}
      motionFor={(item) =>
        motion && motion.livePhotoId === item.livePhotoId ? motion : null
      }
      onIndexChange={() => undefined}
      onClose={onClose}
    />,
    document.body,
  )
}

/**
 * The full screen preview of a set of attachments.
 *
 * The pictures can be changed with a swipe, with the arrows or with the
 * strip at the bottom. The place the reader came from is kept, so closing
 * the preview returns to the same spot in the list.
 */
export function MediaGallery({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: Media[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  if (items.length === 0) return null

  const motionFor = (item: Media) =>
    item.livePhotoId
      ? (items.find((candidate) => candidate.livePhotoId === item.livePhotoId && candidate.id !== item.id) ??
        null)
      : null

  return createPortal(
    <MediaOverlay
      items={items}
      index={index}
      motionFor={motionFor}
      onIndexChange={onIndexChange}
      onClose={onClose}
    />,
    document.body,
  )
}

/** The shared surface of the single and the multi picture preview. */
function MediaOverlay({
  items,
  index,
  motionFor,
  onIndexChange,
  onClose,
}: {
  items: Media[]
  index: number
  motionFor: (media: Media) => Media | null
  onIndexChange: (index: number) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState<ZoomState>(RESET)

  // The index that is really on the screen. A swipe at either end can
  // never take the viewer past the first or the last picture.
  const currentIndex = Math.min(Math.max(index, 0), items.length - 1)
  const media = items[currentIndex]
  const motion = media ? motionFor(media) : null

  const move = useCallback(
    (delta: number) => {
      const next = Math.min(items.length - 1, Math.max(0, currentIndex + delta))
      if (next !== currentIndex) onIndexChange(next)
    },
    [currentIndex, items.length, onIndexChange],
  )
  const moveRef = useRef(move)
  moveRef.current = move
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const surfaceRef = useRef<HTMLDivElement>(null)
  const pictureRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<ZoomState>(RESET)
  zoomRef.current = zoom
  const gesture = useRef<{
    startDistance: number
    startScale: number
    startMid: { x: number; y: number }
    startX: number
    startY: number
    swipeX: number
  } | null>(null)
  const lastTap = useRef(0)

  // The page behind must not move while the viewer is open. The lock is
  // taken once, not again every time the picture changes.
  useEffect(() => lockBodyScroll(), [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key === 'ArrowRight') moveRef.current(1)
      if (event.key === 'ArrowLeft') moveRef.current(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    setPlaying(false)
    setZoom(RESET)
  }, [media?.id])

  /**
   * A picture may be moved while it is larger than the screen, but it must
   * not be thrown away: the edge that is being looked at stays on screen.
   */
  const keepInView = useCallback((x: number, y: number, scale: number) => {
    const surface = surfaceRef.current
    const picture = pictureRef.current
    if (!surface || !picture || scale <= 1) return { x: 0, y: 0 }
    const box = surface.getBoundingClientRect()
    // The element itself is not scaled, so its layout size times the scale
    // is the space it really covers. The extra room at the edges lets the
    // border of the picture sit a little inside the screen.
    const maxX = Math.max(0, (picture.offsetWidth * scale - box.width) / 2)
    const maxY = Math.max(0, (picture.offsetHeight * scale - box.height) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    }
  }, [])

  /** Zooms around a point of the surface, so the finger stays on the image. */
  const zoomAround = useCallback(
    (nextScale: number, point?: { x: number; y: number }) => {
      setZoom((current) => {
        const clamped = Math.min(MAX_SCALE, Math.max(1, nextScale))
        if (!point) return { ...current, scale: clamped, x: 0, y: 0 }
        const surface = surfaceRef.current
        if (!surface) return { ...current, scale: clamped }
        const rect = surface.getBoundingClientRect()
        const localX = point.x - rect.left - rect.width / 2
        const localY = point.y - rect.top - rect.height / 2
        const ratio = clamped / current.scale
        const moved = keepInView(
          localX - (localX - current.x) * ratio,
          localY - (localY - current.y) * ratio,
          clamped,
        )
        return { scale: clamped, x: moved.x, y: moved.y }
      })
    },
    [keepInView],
  )

  function onTouchStart(event: React.TouchEvent) {
    if (event.touches.length === 2) {
      gesture.current = {
        startDistance: distance(event.touches),
        startScale: zoom.scale,
        startMid: midpoint(event.touches),
        startX: zoom.x,
        startY: zoom.y,
        swipeX: 0,
      }
      return
    }

    if (event.touches.length === 1) {
      const now = Date.now()
      if (now - lastTap.current < 300) {
        // A double tap zooms in on the spot, or back out again.
        const next = zoom.scale > 1 ? 1 : 2.5
        zoomAround(next, { x: event.touches[0].clientX, y: event.touches[0].clientY })
        lastTap.current = 0
      } else {
        lastTap.current = now
      }
      gesture.current = {
        startDistance: 0,
        startScale: zoom.scale,
        startMid: { x: event.touches[0].clientX, y: event.touches[0].clientY },
        startX: zoom.x,
        startY: zoom.y,
        swipeX: event.touches[0].clientX,
      }
    }
  }

  function onTouchMove(event: React.TouchEvent) {
    const active = gesture.current
    if (!active) return

    if (event.touches.length === 2 && active.startDistance > 0) {
      const next = active.startScale * (distance(event.touches) / active.startDistance)
      setZoom(() => {
        const clamped = Math.min(MAX_SCALE, Math.max(1, next))
        const mid = midpoint(event.touches)
        const ratio = clamped / active.startScale
        const moved = keepInView(
          active.startX + (mid.x - active.startMid.x) * ratio,
          active.startY + (mid.y - active.startMid.y) * ratio,
          clamped,
        )
        return { scale: clamped, x: moved.x, y: moved.y }
      })
      return
    }

    if (event.touches.length === 1 && zoom.scale > 1) {
      const touch = event.touches[0]
      setZoom((current) => {
        const moved = keepInView(
          active.startX + (touch.clientX - active.startMid.x),
          active.startY + (touch.clientY - active.startMid.y),
          current.scale,
        )
        return { ...current, x: moved.x, y: moved.y }
      })
    }
  }

  function onTouchEnd(event: React.TouchEvent) {
    const active = gesture.current
    if (!active) return
    if (event.touches.length === 0 && active.startDistance === 0 && zoom.scale === 1 && items.length > 1) {
      // A horizontal swipe moves to the next picture.
      const end = event.changedTouches[0]?.clientX ?? active.swipeX
      const delta = end - active.swipeX
      if (Math.abs(delta) > 56) move(delta < 0 ? 1 : -1)
    }
    if (gesture.current) gesture.current.startDistance = 0
  }

  // The wheel listener is attached by hand, because React registers its own
  // wheel handlers as passive and the default browser zoom has to be stopped.
  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && Math.abs(event.deltaY) < 8) return
      event.preventDefault()
      zoomAround(zoomRef.current.scale * (event.deltaY < 0 ? 1.12 : 0.89), {
        x: event.clientX,
        y: event.clientY,
      })
    }
    surface.addEventListener('wheel', onWheel, { passive: false })
    return () => surface.removeEventListener('wheel', onWheel)
  }, [zoomAround])

  if (!media) return null

  const picture = isPicture(media)
  const film = isFilm(media)

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black animate-fade-in">
      <header className="flex shrink-0 items-start gap-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] pb-3 text-white">
        <div className="min-w-0 flex-1 pt-1">
          <p className="truncate text-sm font-semibold">{media.originalName}</p>
          <p className="truncate text-xs text-white/60">
            {formatBytes(media.size)}
            {media.width && media.height ? ` · ${media.width}×${media.height}` : ''}
            {items.length > 1 ? ` · ${currentIndex + 1}/${items.length}` : ''}
          </p>
        </div>
        <a
          href={media.url}
          download={media.originalName}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10"
          aria-label={t('media.download')}
        >
          <DownloadIcon size={20} />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('media.close')}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/12 text-white transition-colors hover:bg-white/20"
        >
          <CloseIcon size={20} />
        </button>
      </header>

      <div
        ref={surfaceRef}
        data-allow-zoom
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden select-none"
      >
        {items.length > 1 ? (
          <GalleryArrow
            side="left"
            disabled={currentIndex <= 0}
            onClick={() => move(-1)}
          />
        ) : null}

        {picture ? (
          <div
            ref={pictureRef}
            className="relative flex max-h-full max-w-full items-center justify-center"
            style={{
              transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.scale})`,
              transition: gesture.current ? 'none' : 'transform 220ms var(--ease-out)',
            }}
          >
            {playing && motion ? (
              <video
                src={motion.url}
                autoPlay
                loop
                muted
                playsInline
                className="max-h-[70dvh] max-w-full rounded-xl object-contain"
              />
            ) : (
              <img
                src={media.url}
                alt={media.originalName}
                draggable={false}
                className="max-h-[70dvh] max-w-full rounded-xl object-contain"
              />
            )}
            {motion ? (
              <div className="absolute bottom-3 left-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setPlaying((value) => !value)}
                  className="bg-white/85 text-ink"
                >
                  {playing ? t('media.stopMotion') : t('media.showMotion')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {film ? (
          <video
            src={media.url}
            controls
            playsInline
            className="max-h-[70dvh] max-w-full rounded-xl bg-black"
          />
        ) : null}

        {!picture && !film ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/10 px-8 py-10 text-white">
            <FileIcon size={40} />
            <p className="text-sm">{media.mimeType || t('media.file')}</p>
            <a
              href={media.url}
              download={media.originalName}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              {t('media.download')}
            </a>
          </div>
        ) : null}

        {items.length > 1 ? (
          <GalleryArrow
            side="right"
            disabled={currentIndex >= items.length - 1}
            onClick={() => move(1)}
          />
        ) : null}

        {picture ? (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/12 p-1 backdrop-blur-xl">
            <button
              type="button"
              onClick={() => zoomAround(zoom.scale / 1.3)}
              aria-label={t('media.zoomOut', 'Zoom out')}
              className="flex size-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 disabled:opacity-40"
              disabled={zoom.scale <= 1}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                <path d="M5.5 12h13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <span className="min-w-12 text-center text-xs font-semibold text-white/80 tabular-nums">
              {Math.round(zoom.scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => zoomAround(zoom.scale * 1.3)}
              aria-label={t('media.zoomIn', 'Zoom in')}
              className="flex size-9 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/15 disabled:opacity-40"
              disabled={zoom.scale >= MAX_SCALE}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
                <path
                  d="M12 5.5v13M5.5 12h13"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      {items.length > 1 ? (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto no-scrollbar px-3 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]">
          {items.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onIndexChange(itemIndex)}
              aria-label={item.originalName}
              aria-current={itemIndex === currentIndex}
              className={cn(
                'relative size-14 shrink-0 overflow-hidden rounded-xl bg-white/10 transition-opacity',
                itemIndex === currentIndex ? 'ring-2 ring-white' : 'opacity-55',
              )}
            >
              <Thumb media={item} />
            </button>
          ))}
        </div>
      ) : media.locationName || media.latitude ? (
        <footer className="shrink-0 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] text-center text-xs text-white/70">
          {media.locationName || `${media.latitude?.toFixed(4)}, ${media.longitude?.toFixed(4)}`}
        </footer>
      ) : (
        <div className="h-[env(safe-area-inset-bottom,0px)]" aria-hidden="true" />
      )}
    </div>
  )
}

/** The arrow that moves to the picture next to the one on the screen. */
function GalleryArrow({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right'
  disabled: boolean
  onClick: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'left' ? t('media.previous') : t('media.next')}
      className={cn(
        'absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-0',
        side === 'left' ? 'left-2' : 'right-2',
      )}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
        <path
          d={side === 'left' ? 'M14.5 5.5L8 12l6.5 6.5' : 'M9.5 5.5L16 12l-6.5 6.5'}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/** A small grid of attachments with a tap-to-open viewer. */
export function MediaStrip({
  media,
  className,
  onOpen,
}: {
  media: Media[]
  className?: string
  /** Called with the picture that was tapped and its place in the list. */
  onOpen?: (media: Media, index: number) => void
}) {
  const { t } = useTranslation()
  const [active, setActive] = useState<{ media: Media; index: number } | null>(null)

  if (media.length === 0) return null

  const motionFor = (item: Media) =>
    item.livePhotoId
      ? (media.find((candidate) => candidate.livePhotoId === item.livePhotoId && candidate.id !== item.id) ??
        null)
      : null

  function open(item: Media, index: number) {
    if (onOpen) {
      onOpen(item, index)
      return
    }
    setActive({ media: item, index })
  }

  return (
    <>
      <div
        className={cn(
          'grid gap-2',
          media.length === 1 ? 'grid-cols-1' : media.length <= 4 ? 'grid-cols-2' : 'grid-cols-3',
          className,
        )}
      >
        {media.map((item, index) => {
          const picture = isPicture(item)
          const film = isFilm(item)
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => open(item, index)}
              className={cn(
                'group relative overflow-hidden rounded-2xl bg-paper-sunken',
                media.length === 1 ? 'aspect-[4/3]' : 'aspect-square',
              )}
              aria-label={item.originalName}
            >
              {picture || film ? (
                <Thumb
                  media={item}
                  className="transition-transform duration-200 group-hover:scale-[1.04]"
                />
              ) : null}
              {item.kind === 'live-still' ? (
                <span className="absolute top-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[0.625rem] font-semibold text-white backdrop-blur-sm">
                  {t('media.livePhoto')}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      {active ? (
        <MediaViewer
          media={active.media}
          motion={motionFor(active.media)}
          onClose={() => setActive(null)}
        />
      ) : null}
    </>
  )
}
