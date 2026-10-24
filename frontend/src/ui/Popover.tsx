/* eslint-disable react-refresh/only-export-components */
/**
 * The popover: a small panel that opens beside the control that asked for it.
 *
 * Every short choice in the journal — a menu, a filter, a list of folders —
 * opens in one of these instead of in a sheet that rises from the bottom of
 * the screen. The panel stays next to the button that opened it, so the thumb
 * never has to travel, and it closes as soon as the finger lands anywhere
 * else.
 *
 * It is drawn in a portal on the body, because a panel anchored to a button
 * in the top bar must not be clipped by the bar or by the page.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/cn'
import { CheckIcon } from './icons'

export type PopoverPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end'

/** The gap between the control and the panel. */
const GAP = 8
/** The smallest gap the panel keeps from the edge of the screen. */
const MARGIN = 8
/** How long the panel takes to leave. */
const EXIT_MS = 150

interface Box {
  left: number
  top: number
  vertical: 'top' | 'bottom'
  horizontal: 'start' | 'end'
}

interface PopoverProps<T extends HTMLElement> {
  open: boolean
  onClose: () => void
  /** The control the panel hangs from. */
  anchorRef: RefObject<T | null>
  children: ReactNode
  /** Where the panel sits beside the control. */
  placement?: PopoverPlacement
  className?: string
  label?: string
}

/**
 * A panel anchored to a control. It follows the control when the page
 * scrolls, turns itself over when there is no room below, and keeps itself
 * inside the screen.
 */
export function Popover<T extends HTMLElement = HTMLElement>({
  open,
  onClose,
  anchorRef,
  children,
  placement = 'bottom-end',
  className,
  label,
}: PopoverProps<T>) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [mounted, setMounted] = useState(open)
  const [leaving, setLeaving] = useState(false)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (open) {
      setMounted(true)
      setLeaving(false)
      return
    }
    if (!mounted) return
    setLeaving(true)
    const timer = window.setTimeout(() => {
      setMounted(false)
      setLeaving(false)
      setBox(null)
    }, EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [open, mounted])

  const measure = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    // The size is taken from the layout, not from the screen. The panel
    // grows a little as it opens, and a scaled measurement would place it
    // a few pixels off.
    const panelWidth = panel.offsetWidth
    const panelHeight = panel.offsetHeight

    const anchor = anchorRef.current
    if (!anchor) {
      // The control that asked for the panel is gone. Keep the panel in
      // sight instead of leaving it nowhere.
      setBox((current) =>
        current && current.horizontal === 'start' && current.vertical === 'bottom'
          ? current
          : {
              left: Math.max(MARGIN, (viewportWidth - panelWidth) / 2),
              top: MARGIN,
              vertical: 'bottom',
              horizontal: 'start',
            },
      )
      return
    }
    const anchorBox = anchor.getBoundingClientRect()

    // The panel turns over when the side it wants does not fit.
    let vertical: 'top' | 'bottom' = placement.startsWith('bottom') ? 'bottom' : 'top'
    const roomBelow = viewportHeight - anchorBox.bottom
    const roomAbove = anchorBox.top
    if (vertical === 'bottom' && roomBelow < panelHeight + GAP && roomAbove > roomBelow) vertical = 'top'
    if (vertical === 'top' && roomAbove < panelHeight + GAP && roomBelow > roomAbove) vertical = 'bottom'

    const horizontal: 'start' | 'end' = placement.endsWith('start') ? 'start' : 'end'
    const rawLeft = horizontal === 'start' ? anchorBox.left : anchorBox.right - panelWidth
    const maxLeft = Math.max(MARGIN, viewportWidth - panelWidth - MARGIN)
    const left = Math.min(Math.max(MARGIN, rawLeft), maxLeft)

    const rawTop = vertical === 'bottom' ? anchorBox.bottom + GAP : anchorBox.top - GAP - panelHeight
    const maxTop = Math.max(MARGIN, viewportHeight - panelHeight - MARGIN)
    const top = Math.min(Math.max(MARGIN, rawTop), maxTop)

    setBox((current) =>
      current && current.left === left && current.top === top
        ? current
        : { left, top, vertical, horizontal },
    )
  }, [anchorRef, placement])

  // The place is worked out before the first paint, so the panel never shows
  // up in the corner and then slides to where it belongs.
  useLayoutEffect(() => {
    if (!mounted) return
    measure()
  }, [mounted, measure])

  // A panel whose content grows or shrinks has to find its place again.
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!mounted || !panel) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(panel)
    return () => observer.disconnect()
  }, [mounted, measure])

  // The panel follows the control while the page moves under it. A control
  // that sits in a row of its own can be moved by that row scrolling, and
  // such a scroll does not reach the window, so the document watches for it
  // on the way down.
  useEffect(() => {
    if (!open) return
    const onMove = () => measure()
    window.addEventListener('scroll', onMove, { passive: true })
    window.addEventListener('resize', onMove)
    document.addEventListener('scroll', onMove, { passive: true, capture: true })
    return () => {
      window.removeEventListener('scroll', onMove)
      window.removeEventListener('resize', onMove)
      document.removeEventListener('scroll', onMove, true)
    }
  }, [open, measure])

  // A tap anywhere else, or the escape key, closes the panel.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      closeRef.current()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open, anchorRef])

  // The keyboard follows the panel, and goes back where it came from.
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => {
      const panel = panelRef.current
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    }, 30)
    return () => {
      window.clearTimeout(timer)
      previous?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!mounted) return null

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      aria-modal={false}
      tabIndex={-1}
      style={{
        position: 'fixed',
        left: box?.left ?? 0,
        top: box?.top ?? 0,
        visibility: box ? 'visible' : 'hidden',
        transformOrigin: `${box?.horizontal === 'start' ? 'left' : 'right'} ${
          box?.vertical === 'bottom' ? 'top' : 'bottom'
        }`,
      }}
      className={cn(
        'z-[85] rounded-[18px] bg-leaf shadow-float outline-none',
        'transition-[opacity,transform] duration-150 ease-[var(--ease-out-soft)]',
        leaving ? 'scale-[0.97] opacity-0' : box?.vertical === 'top' ? 'animate-popover-up' : 'animate-popover',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  )
}

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  destructive?: boolean
  checked?: boolean
  disabled?: boolean
  onSelect: () => void
}

/** A short list of actions, the way iOS presents "more". */
export function Menu<T extends HTMLElement = HTMLElement>({
  open,
  onClose,
  anchorRef,
  items,
  placement = 'bottom-end',
  label,
}: {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<T | null>
  items: MenuItem[]
  placement?: PopoverPlacement
  label?: string
}) {
  return (
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement={placement}
      label={label}
      className="w-max min-w-[10rem] max-w-[min(18rem,calc(100vw_-_1.5rem))] p-1.5"
    >
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              disabled={item.disabled}
              onClick={() => {
                onClose()
                item.onSelect()
              }}
              className={cn(
                'flex min-h-[44px] w-full items-center gap-3 rounded-[12px] px-2.5 text-left text-[0.9375rem] transition-colors active:bg-well disabled:opacity-40',
                item.destructive ? 'text-danger' : 'text-ink',
              )}
            >
              {item.icon ? (
                <span className={cn('flex size-5 items-center justify-center', !item.destructive && 'text-ink-2')}>
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.checked ? <CheckIcon size={18} className="text-accent" /> : null}
            </button>
          </li>
        ))}
      </ul>
    </Popover>
  )
}
