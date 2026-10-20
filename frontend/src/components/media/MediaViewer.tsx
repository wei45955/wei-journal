import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { formatBytes } from '../../lib/format'
import type { Media } from '../../lib/types'
import { Button } from '../ui'
import { CloseIcon, DownloadIcon, FileIcon, VideoIcon } from '../icons'

interface MediaViewerProps {
  media: Media | null
  onClose: () => void
  /** The motion component of a Live Photo, when one exists. */
  motion?: Media | null
}

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

/**
 * A full screen preview of one attachment. A photograph can be pinched,
 * dragged and double tapped to zoom, without the page around it ever zooming.
 */
export function MediaViewer({ media, onClose, motion }: MediaViewerProps) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoom] = useState<ZoomState>(RESET)

  const surfaceRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef<ZoomState>(RESET)
  zoomRef.current = zoom
  const gesture = useRef<{
    startDistance: number
    startScale: number
    startMid: { x: number; y: number }
    startX: number
    startY: number
  } | null>(null)
  const lastTap = useRef(0)

  useEffect(() => {
    if (!media) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [media, onClose])

  useEffect(() => {
    setPlaying(false)
    setZoom(RESET)
  }, [media?.id])

  /** Zooms around a point of the surface, so the finger stays on the image. */
  const zoomAround = useCallback((nextScale: number, point?: { x: number; y: number }) => {
    setZoom((current) => {
      const clamped = Math.min(MAX_SCALE, Math.max(1, nextScale))
      if (!point) return { ...current, scale: clamped, x: 0, y: 0 }
      const surface = surfaceRef.current
      if (!surface) return { ...current, scale: clamped }
      const rect = surface.getBoundingClientRect()
      const localX = point.x - rect.left - rect.width / 2
      const localY = point.y - rect.top - rect.height / 2
      const ratio = clamped / current.scale
      return {
        scale: clamped,
        x: localX - (localX - current.x) * ratio,
        y: localY - (localY - current.y) * ratio,
      }
    })
  }, [])

  function onTouchStart(event: React.TouchEvent) {
    if (event.touches.length === 2) {
      gesture.current = {
        startDistance: distance(event.touches),
        startScale: zoom.scale,
        startMid: midpoint(event.touches),
        startX: zoom.x,
        startY: zoom.y,
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
        return {
          scale: clamped,
          x: active.startX + (mid.x - active.startMid.x) * ratio,
          y: active.startY + (mid.y - active.startMid.y) * ratio,
        }
      })
      return
    }

    if (event.touches.length === 1 && zoom.scale > 1) {
      const touch = event.touches[0]
      setZoom((current) => ({
        ...current,
        x: active.startX + (touch.clientX - active.startMid.x),
        y: active.startY + (touch.clientY - active.startMid.y),
      }))
    }
  }

  function onTouchEnd() {
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

  const isImage = media.kind === 'image' || media.kind === 'live-still'
  const isVideo = media.kind === 'video' || media.kind === 'live-motion'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 animate-fade-in">
      <header className="flex items-center gap-3 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{media.originalName}</p>
          <p className="truncate text-xs text-white/60">
            {formatBytes(media.size)}
            {media.width && media.height ? ` · ${media.width}×${media.height}` : ''}
          </p>
        </div>
        <a
          href={media.url}
          download={media.originalName}
          className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10"
          aria-label={t('media.download')}
        >
          <DownloadIcon size={20} />
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('media.close')}
          className="rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
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
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden p-4 select-none"
      >
        {isImage ? (
          <div
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
                className="max-h-[70vh] max-w-full rounded-xl object-contain"
              />
            ) : (
              <img
                src={media.url}
                alt={media.originalName}
                draggable={false}
                className="max-h-[70vh] max-w-full rounded-xl object-contain"
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

        {isVideo ? (
          <video
            src={media.url}
            controls
            playsInline
            className="max-h-[70vh] max-w-full rounded-xl bg-black"
          />
        ) : null}

        {!isImage && !isVideo ? (
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

        {isImage ? (
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

      {media.locationName || media.latitude ? (
        <footer className="px-4 py-3 text-center text-xs text-white/70">
          {media.locationName || `${media.latitude?.toFixed(4)}, ${media.longitude?.toFixed(4)}`}
        </footer>
      ) : null}
    </div>
  )
}

/** A small grid of attachments with a tap-to-open viewer. */
export function MediaStrip({
  media,
  className,
}: {
  media: Media[]
  className?: string
}) {
  const { t } = useTranslation()
  const [active, setActive] = useState<Media | null>(null)

  if (media.length === 0) return null

  const motionFor = (item: Media) =>
    item.livePhotoId
      ? (media.find((candidate) => candidate.livePhotoId === item.livePhotoId && candidate.id !== item.id) ?? null)
      : null

  return (
    <>
      <div className={cn('grid grid-cols-2 gap-2 sm:grid-cols-3', className)}>
        {media.map((item) => {
          const isImage = item.kind === 'image' || item.kind === 'live-still'
          const isVideo = item.kind === 'video' || item.kind === 'live-motion'
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(item)}
              className="group relative aspect-square overflow-hidden rounded-2xl bg-paper-sunken"
              aria-label={item.originalName}
            >
              {isImage ? (
                <img
                  src={item.hasThumb ? item.thumbUrl : item.url}
                  alt={item.originalName}
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
                />
              ) : isVideo ? (
                <span className="flex size-full items-center justify-center text-ink-faint">
                  <VideoIcon size={28} />
                </span>
              ) : (
                <span className="flex size-full flex-col items-center justify-center gap-1 text-ink-faint">
                  <FileIcon size={24} />
                  <span className="px-2 text-[0.6875rem] break-all">{item.originalName}</span>
                </span>
              )}
              {item.kind === 'live-still' ? (
                <span className="absolute top-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[0.625rem] font-semibold text-white backdrop-blur-sm">
                  {t('media.livePhoto')}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <MediaViewer
        media={active}
        motion={active ? motionFor(active) : null}
        onClose={() => setActive(null)}
      />
    </>
  )
}
