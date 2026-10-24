import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { formatBytes } from '../../lib/format'
import { lockBodyScroll } from '../../lib/scrollLock'
import type { Media } from '../../lib/types'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DownloadIcon, FileIcon, LiveIcon } from '../../ui/icons'
import { isFilm, isPicture, motionOf } from './Thumb'

const MAX_SCALE = 4
/** How close two taps must be to count as one double tap. */
const TAP_WINDOW = 280
/** How long a single tap waits to see whether a second one follows. */
const TOUCH_CLOSE_DELAY = 300
/**
 * The same wait for the mouse. It is longer, because a double click by
 * hand is slower than a double tap by finger.
 */
const MOUSE_CLOSE_DELAY = 400

interface View {
  scale: number
  x: number
  y: number
}
const RESET: View = { scale: 1, x: 0, y: 0 }

type Touches = React.TouchList
const gap = (touches: Touches) =>
  Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
const centre = (touches: Touches) => ({
  x: (touches[0].clientX + touches[1].clientX) / 2,
  y: (touches[0].clientY + touches[1].clientY) / 2,
})

/**
 * Photos and films on black, edge to edge. Swipe sideways to move between
 * them, swipe down to close, pinch or double-tap to look closer. A Live
 * Photo plays while it is pressed, the way it does on the phone.
 *
 * One tap closes the picture and one double tap zooms it, in both
 * directions. The two are told apart by waiting for the second tap, so a
 * double tap never closes the picture first.
 */
export function Viewer({
  items,
  all,
  index,
  onIndex,
  onClose,
}: {
  items: Media[]
  /** Every attachment of the entry, to find the motion half of a Live Photo. */
  all?: Media[]
  index: number
  onIndex: (index: number) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const current = Math.min(Math.max(index, 0), items.length - 1)
  const media = items[current]
  const motion = media ? motionOf(media, all ?? items) : null
  const isPhoto = media ? isPicture(media) : false
  const film = media ? isFilm(media) : false

  const [view, setView] = useState<View>(RESET)
  const [dragX, setDragX] = useState(0)
  const [dragY, setDragY] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [animating, setAnimating] = useState(false)

  const surface = useRef<HTMLDivElement>(null)
  const picture = useRef<HTMLElement | null>(null)
  const setPicture = useCallback((element: HTMLElement | null) => {
    picture.current = element
  }, [])
  const gesture = useRef<{
    kind: 'none' | 'swipe' | 'pan' | 'pinch'
    x: number
    y: number
    startView: View
    startGap: number
    startCentre: { x: number; y: number }
    time: number
    axis?: 'x' | 'y'
  }>({ kind: 'none', x: 0, y: 0, startView: RESET, startGap: 0, startCentre: { x: 0, y: 0 }, time: 0 })
  const lastTap = useRef(0)
  const pendingClose = useRef<number | null>(null)
  const lastTouchZoom = useRef(0)
  const pointerType = useRef('')
  const holdTimer = useRef<number | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const move = useCallback(
    (delta: number) => {
      const next = current + delta
      if (next < 0 || next >= items.length) return
      onIndex(next)
    },
    [current, items.length, onIndex],
  )
  const moveRef = useRef(move)
  moveRef.current = move

  useEffect(() => lockBodyScroll(), [])
  useEffect(
    () => () => {
      if (pendingClose.current !== null) window.clearTimeout(pendingClose.current)
    },
    [],
  )
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
      if (event.key === 'ArrowRight') moveRef.current(1)
      if (event.key === 'ArrowLeft') moveRef.current(-1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => {
    setView(RESET)
    setPlaying(false)
    setDragX(0)
    setDragY(0)
    // Another picture is on the screen, so the closing is called off.
    cancelPendingClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media?.id])

  const clamp = useCallback((next: View): View => {
    const box = surface.current?.getBoundingClientRect()
    if (!box || next.scale <= 1) return { scale: Math.max(1, next.scale), x: 0, y: 0 }
    // The picture may be dragged only as far as its own edges. The size is
    // read from the layout, not from the screen, because the screen already
    // carries the zoom.
    const shown = picture.current
    const width = shown ? shown.offsetWidth : box.width
    const height = shown ? shown.offsetHeight : box.height
    const maxX = Math.max(0, (width * next.scale - box.width) / 2)
    const maxY = Math.max(0, (height * next.scale - box.height) / 2)
    return {
      scale: Math.min(MAX_SCALE, next.scale),
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    }
  }, [])

  const zoomAt = useCallback(
    (scale: number, point?: { x: number; y: number }) => {
      const box = surface.current?.getBoundingClientRect()
      const from = viewRef.current
      if (!box || !point) {
        setView(clamp({ ...from, scale }))
        return
      }
      const px = point.x - box.left - box.width / 2
      const py = point.y - box.top - box.height / 2
      const ratio = scale / from.scale
      setView(clamp({ scale, x: px - (px - from.x) * ratio, y: py - (py - from.y) * ratio }))
    },
    [clamp],
  )

  /** A double tap looks closer, and a second one puts the picture back. */
  const toggleZoom = useCallback(
    (x: number, y: number) => {
      setAnimating(true)
      zoomAt(viewRef.current.scale > 1 ? 1 : 2.5, { x, y })
    },
    [zoomAt],
  )

  function cancelPendingClose() {
    if (pendingClose.current !== null) {
      window.clearTimeout(pendingClose.current)
      pendingClose.current = null
    }
  }

  /** One tap closes the picture, unless a second tap follows it. */
  function scheduleClose(delay: number) {
    cancelPendingClose()
    pendingClose.current = window.setTimeout(() => {
      pendingClose.current = null
      closeRef.current()
    }, delay)
  }

  useEffect(() => {
    const element = surface.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && Math.abs(event.deltaY) < 4) return
      event.preventDefault()
      cancelPendingClose()
      setAnimating(false)
      zoomAt(viewRef.current.scale * (event.deltaY < 0 ? 1.12 : 0.89), { x: event.clientX, y: event.clientY })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  function stopHold() {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    holdTimer.current = null
  }

  function onTouchStart(event: React.TouchEvent) {
    setAnimating(false)
    // A new gesture means the reader is looking at the picture, not at
    // leaving it.
    cancelPendingClose()
    const g = gesture.current
    if (event.touches.length === 2) {
      stopHold()
      g.kind = 'pinch'
      g.startGap = gap(event.touches)
      g.startCentre = centre(event.touches)
      g.startView = viewRef.current
      return
    }
    const touch = event.touches[0]
    g.x = touch.clientX
    g.y = touch.clientY
    g.time = Date.now()
    g.startView = viewRef.current
    g.axis = undefined
    g.kind = viewRef.current.scale > 1 ? 'pan' : 'swipe'
    if (motion) {
      holdTimer.current = window.setTimeout(() => setPlaying(true), 260)
    }
  }

  function onTouchMove(event: React.TouchEvent) {
    const g = gesture.current
    if (g.kind === 'pinch' && event.touches.length === 2) {
      const scale = g.startView.scale * (gap(event.touches) / Math.max(1, g.startGap))
      const c = centre(event.touches)
      setView(
        clamp({
          scale,
          x: g.startView.x + (c.x - g.startCentre.x),
          y: g.startView.y + (c.y - g.startCentre.y),
        }),
      )
      return
    }
    const touch = event.touches[0]
    const dx = touch.clientX - g.x
    const dy = touch.clientY - g.y
    if (Math.hypot(dx, dy) > 8) stopHold()
    if (g.kind === 'pan') {
      setView(clamp({ ...g.startView, x: g.startView.x + dx, y: g.startView.y + dy }))
      return
    }
    if (g.kind === 'swipe') {
      if (!g.axis && Math.hypot(dx, dy) > 10) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (g.axis === 'x') {
        const atEdge = (dx > 0 && current === 0) || (dx < 0 && current === items.length - 1)
        setDragX(atEdge ? dx / 3 : dx)
      } else if (g.axis === 'y') {
        setDragY(Math.max(0, dy))
      }
    }
  }

  function onTouchEnd(event: React.TouchEvent) {
    stopHold()
    setPlaying(false)
    const g = gesture.current
    if (event.touches.length > 0) return
    setAnimating(true)
    const touch = event.changedTouches[0]
    const dx = touch.clientX - g.x
    const dy = touch.clientY - g.y
    const elapsed = Date.now() - g.time

    if (g.kind === 'swipe' && g.axis === 'x') {
      const fast = Math.abs(dx) / elapsed > 0.4
      if (Math.abs(dx) > window.innerWidth * 0.22 || (fast && Math.abs(dx) > 30)) move(dx < 0 ? 1 : -1)
      setDragX(0)
    } else if (g.kind === 'swipe' && g.axis === 'y') {
      if (dy > 120 || (dy > 40 && dy / elapsed > 0.5)) onClose()
      else setDragY(0)
    } else if (g.kind !== 'pinch' && Math.hypot(dx, dy) < 8 && elapsed < 250) {
      // A video has its own controls, and the phone hands the picture to
      // the system player. A tap there belongs to the video, so it neither
      // closes the picture nor zooms it.
      if (film) {
        g.kind = 'none'
        return
      }
      const now = Date.now()
      if (now - lastTap.current < TAP_WINDOW) {
        // The second tap of a double tap: look closer, or come back. The
        // close that the first tap booked is called off, so a double tap
        // never closes the picture.
        lastTap.current = 0
        cancelPendingClose()
        toggleZoom(touch.clientX, touch.clientY)
        lastTouchZoom.current = now
      } else {
        // The first tap of a possible double tap. The picture closes a
        // moment later, unless a second tap follows and takes that back.
        lastTap.current = now
        scheduleClose(TOUCH_CLOSE_DELAY)
      }
    } else if (viewRef.current.scale < 1.02) {
      // A drag that was not a drag: put the picture back where it was.
      setView(RESET)
    }
    g.kind = 'none'
  }

  if (!media) return null
  const fade = 1 - Math.min(dragY / 400, 0.6)

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex flex-col text-white animate-fade"
      style={{ backgroundColor: `rgb(0 0 0 / ${fade})` }}
      role="dialog"
      aria-modal="true"
      aria-label={media.originalName}
    >
      <header
        className={cn(
          'absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-gradient-to-b from-black/50 to-transparent px-2 pt-[calc(env(safe-area-inset-top)+0.25rem)] pb-6 transition-opacity duration-200',
          dragY === 0 ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="press flex size-11 items-center justify-center rounded-full"
        >
          <CloseIcon size={24} />
        </button>
        <div className="min-w-0 flex-1 text-center">
          {items.length > 1 ? (
            <p className="tnum text-[0.9375rem] font-medium">
              {t('media.position', { index: current + 1, total: items.length })}
            </p>
          ) : null}
          {motion ? (
            <p className="mt-0.5 flex items-center justify-center gap-1 text-[0.75rem] text-white/70">
              <LiveIcon size={13} />
              {t('media.holdToPlay')}
            </p>
          ) : null}
        </div>
        <a
          href={media.url}
          download={media.originalName}
          aria-label={t('media.download')}
          className="press flex size-11 items-center justify-center rounded-full"
        >
          <DownloadIcon size={22} />
        </a>
      </header>

      <div
        ref={surface}
        data-allow-zoom
        onPointerDown={(event) => {
          pointerType.current = event.pointerType
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClick={(event) => {
          // A finger has already been listened to; this is the mouse.
          if (pointerType.current === 'touch') return
          // A video belongs to its own controls.
          if (film) return
          if (event.detail > 1) {
            // The second click of a double click. The close that the first
            // one booked is called off.
            cancelPendingClose()
            return
          }
          scheduleClose(MOUSE_CLOSE_DELAY)
        }}
        onDoubleClick={(event) => {
          // A double tap on a phone also sends a double click, a moment
          // later. That one has already done the work.
          if (Date.now() - lastTouchZoom.current < 500) return
          // A video is not zoomed; its controls need the tap.
          if (film) return
          cancelPendingClose()
          toggleZoom(event.clientX, event.clientY)
        }}
        className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden select-none"
      >
        <div
          className="flex size-full items-center justify-center"
          style={{
            transform: `translate3d(${dragX + view.x}px, ${dragY + view.y}px, 0) scale(${view.scale * (1 - Math.min(dragY / 1600, 0.15))})`,
            transition: animating ? 'transform 260ms var(--ease-out-soft)' : 'none',
          }}
        >
          {isPhoto ? (
            playing && motion ? (
              <video src={motion.url} autoPlay muted playsInline className="max-h-full max-w-full object-contain" />
            ) : (
              <img
                ref={setPicture}
                src={media.hasPreview ? media.previewUrl : media.url}
                alt={media.originalName}
                draggable={false}
                className="max-h-full max-w-full object-contain"
              />
            )
          ) : film ? (
            <video
              key={media.id}
              ref={setPicture}
              src={media.url}
              controls
              playsInline
              className="max-h-full max-w-full bg-black"
            />
          ) : (
            <div className="flex flex-col items-center gap-4 text-center">
              <FileIcon size={44} />
              <div>
                <p className="max-w-[16rem] truncate text-[1rem] font-medium">{media.originalName}</p>
                <p className="mt-1 text-[0.875rem] text-white/60">{formatBytes(media.size)}</p>
              </div>
              <a
                href={media.url}
                download={media.originalName}
                onClick={(event) => event.stopPropagation()}
                className="press rounded-full bg-white px-5 py-2.5 text-[0.9375rem] font-semibold text-black"
              >
                {t('media.download')}
              </a>
            </div>
          )}
        </div>

        {items.length > 1 ? (
          <>
            <button
              type="button"
              aria-label={t('media.previous')}
              disabled={current === 0}
              onClick={(event) => {
                event.stopPropagation()
                move(-1)
              }}
              className="press absolute left-3 hidden size-11 items-center justify-center rounded-full bg-white/10 disabled:opacity-0 sm:flex"
            >
              <ChevronLeftIcon size={24} />
            </button>
            <button
              type="button"
              aria-label={t('media.next')}
              disabled={current === items.length - 1}
              onClick={(event) => {
                event.stopPropagation()
                move(1)
              }}
              className="press absolute right-3 hidden size-11 items-center justify-center rounded-full bg-white/10 disabled:opacity-0 sm:flex"
            >
              <ChevronRightIcon size={24} />
            </button>
          </>
        ) : null}
      </div>

      {items.length > 1 ? (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 flex justify-center gap-1.5 bg-gradient-to-t from-black/50 to-transparent pt-8 pb-[calc(env(safe-area-inset-bottom)+0.9rem)] transition-opacity duration-200',
            dragY === 0 ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden="true"
        >
          {items.length <= 12
            ? items.map((item, i) => (
                <span
                  key={item.id}
                  className={cn('h-1.5 rounded-full transition-all duration-200', i === current ? 'w-4 bg-white' : 'w-1.5 bg-white/40')}
                />
              ))
            : null}
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
