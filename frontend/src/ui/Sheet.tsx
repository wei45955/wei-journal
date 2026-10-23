/* eslint-disable react-refresh/only-export-components */
/**
 * The sheet: the one surface every dialog, picker and menu uses.
 *
 * On a phone it rises from the bottom, within reach of the thumb, and can be
 * pulled down to close. On a wide screen it becomes a centred panel. It locks
 * the page behind it, keeps the keyboard focus inside and returns the focus
 * to where it came from.
 */

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { lockBodyScroll } from '../lib/scrollLock'
import { Button } from './index'

const EXIT_MS = 220

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  /** A control on the right of the title, such as "Done". */
  action?: ReactNode
  children: ReactNode
  /** May grow tall on a phone, for pickers with a long list. */
  tall?: boolean
  /** The panel width on a wide screen. */
  width?: 'sm' | 'md' | 'lg'
  /** Content pinned below the scrolling area. */
  footer?: ReactNode
  label?: string
}

export function Sheet({ open, onClose, title, action, children, tall, width = 'md', footer, label }: SheetProps) {
  const { t } = useTranslation()
  const [mounted, setMounted] = useState(open)
  const [leaving, setLeaving] = useState(false)
  const [drag, setDrag] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const start = useRef<{ y: number; time: number } | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const releaseRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      setLeaving(false)
      setDrag(0)
      return
    }
    if (!mounted) return
    setLeaving(true)
    const timer = window.setTimeout(() => {
      setMounted(false)
      setLeaving(false)
    }, EXIT_MS)
    return () => window.clearTimeout(timer)
  }, [open, mounted])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const release = lockBodyScroll()
    releaseRef.current = release
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const timer = window.setTimeout(() => {
      const panel = panelRef.current
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })
    }, 40)
    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
      previous?.focus?.({ preventScroll: true })
    }
  }, [open])

  // The page stays held still until the panel has finished leaving, so the
  // text behind it does not jump while it is still on screen.
  useEffect(() => {
    if (mounted) return
    const release = releaseRef.current
    releaseRef.current = null
    release?.()
  }, [mounted])

  useEffect(
    () => () => {
      const release = releaseRef.current
      releaseRef.current = null
      release?.()
    },
    [],
  )

  if (!mounted) return null

  function onPointerDown(event: React.PointerEvent) {
    if (event.pointerType === 'mouse') return
    start.current = { y: event.clientY, time: Date.now() }
  }
  function onPointerMove(event: React.PointerEvent) {
    if (!start.current) return
    setDrag(Math.max(0, event.clientY - start.current.y))
  }
  function onPointerUp(event: React.PointerEvent) {
    if (!start.current) return
    const distance = event.clientY - start.current.y
    const speed = distance / Math.max(1, Date.now() - start.current.time)
    start.current = null
    if (distance > 110 || speed > 0.6) closeRef.current()
    else setDrag(0)
  }

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl' }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-[var(--wj-scrim)] transition-opacity duration-200',
          leaving ? 'opacity-0' : 'animate-fade',
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? title}
        tabIndex={-1}
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        className={cn(
          'relative flex w-full flex-col overflow-hidden bg-leaf shadow-sheet outline-none',
          'rounded-t-[26px] sm:rounded-[22px]',
          // The panel is as tall as its content, up to a limit. A sheet that
          // always fills the screen leaves a large blank band under a short
          // list of choices.
          tall ? 'max-h-[85dvh] sm:max-h-[80dvh]' : 'max-h-[72dvh] sm:max-h-[70dvh]',
          widths[width],
          'transition-transform duration-[220ms] ease-[var(--ease-sheet)]',
          leaving ? 'translate-y-full sm:translate-y-0 sm:opacity-0 sm:scale-[0.97]' : 'animate-sheet sm:animate-pop',
        )}
      >
        <div
          className="shrink-0 touch-none select-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="flex justify-center pt-2 pb-1 sm:hidden" aria-hidden="true">
            <span className="h-[5px] w-9 rounded-full bg-rule" />
          </div>
          {title || action ? (
            <header className="flex min-h-12 items-center gap-3 px-5 pt-1 pb-2 sm:pt-4">
              <h2 className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold text-ink">{title}</h2>
              {action ?? (
                <button
                  type="button"
                  onClick={onClose}
                  className="press -mr-2 h-10 rounded-full px-3 text-[0.9375rem] font-medium text-accent"
                >
                  {t('common.done')}
                </button>
              )}
            </header>
          ) : null}
        </div>
        {/* The body carries the safe area itself, so a sheet without a footer
            does not end in an empty white strip. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
        {footer ? (
          <footer className="shrink-0 border-t border-rule px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

/** A question with a clear answer. The destructive answer is red and named. */
export function ConfirmSheet({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  destructive,
  busy,
  secondaryLabel,
  onSecondary,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  body?: string
  confirmLabel: string
  destructive?: boolean
  busy?: boolean
  secondaryLabel?: string
  onSecondary?: () => void
}) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onClose={() => !busy && onClose()} width="sm" label={title}>
      <div className="pt-3 text-center sm:pt-6">
        <h2 className="font-serif text-[1.375rem] leading-snug font-medium text-ink">{title}</h2>
        {body ? <p className="mx-auto mt-2 max-w-[20rem] text-[0.9375rem] leading-relaxed text-ink-2">{body}</p> : null}
      </div>
      <div className="mt-6 flex flex-col gap-2">
        <Button
          block
          size="lg"
          tone={destructive ? 'danger' : 'primary'}
          loading={busy}
          onClick={onConfirm}
          className={destructive ? '!bg-danger !text-white' : undefined}
        >
          {confirmLabel}
        </Button>
        {secondaryLabel && onSecondary ? (
          <Button block size="lg" tone="secondary" disabled={busy} onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        ) : null}
        <Button block size="lg" tone="quiet" disabled={busy} onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </Sheet>
  )
}
