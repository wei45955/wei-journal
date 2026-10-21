import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { lockBodyScroll } from '../../lib/scrollLock'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children?: ReactNode
  footer?: ReactNode
  /** Full height sheet on small screens, centred panel on large ones. */
  size?: 'sm' | 'md' | 'lg'
}

export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const release = lockBodyScroll()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      // Keep the focus inside the sheet, so the page behind it cannot be
      // reached with the keyboard.
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    // A field with autofocus keeps it; otherwise the sheet itself takes the
    // focus, without the browser scrolling the page behind.
    const timer = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel || panel.contains(document.activeElement)) return
      panel.focus({ preventScroll: true })
    }, 50)

    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(timer)
      release()
      previouslyFocused?.focus?.({ preventScroll: true })
    }
  }, [open])

  if (!open) return null

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl' }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-ink/35 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          // dvh, not vh: the sheet must shrink with the browser bars on a
          // phone instead of hiding its last row beneath them.
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden',
          'rounded-t-[1.75rem] bg-paper-overlay shadow-lift animate-sheet-up',
          'sm:rounded-[1.75rem]',
          widths[size],
        )}
      >
        <span
          className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line-strong sm:hidden"
          aria-hidden="true"
        />
        <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 className="font-display text-[1.25rem] font-bold tracking-tight text-ink-strong">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-muted">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('entries.close')}
            className="-mt-1 -mr-1.5 flex size-10 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors active:bg-paper-sunken hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {children ? <div className="flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div> : null}
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line/70 px-5 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] sm:px-6 sm:pb-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

/** A lightweight confirmation prompt built on the dialog. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  alternateLabel,
  onAlternate,
  destructive,
  busy,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: string
  confirmLabel: string
  cancelLabel?: string
  /** A third choice, such as leaving without saving. */
  alternateLabel?: string
  onAlternate?: () => void
  destructive?: boolean
  busy?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          {alternateLabel && onAlternate ? (
            <button
              type="button"
              disabled={busy}
              onClick={onAlternate}
              className="mr-auto min-h-11 rounded-full px-3 text-[0.9375rem] font-medium text-danger transition-colors active:scale-[0.97] disabled:opacity-50 hover:bg-danger-soft"
            >
              {alternateLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 rounded-full px-4 text-[0.9375rem] font-semibold text-ink-muted transition-colors active:scale-[0.97] disabled:opacity-50 hover:bg-paper-sunken hover:text-ink"
          >
            {cancelLabel ?? t('entries.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              onConfirm()
            }}
            className={cn(
              'min-h-11 rounded-full px-4 text-[0.9375rem] font-semibold transition-all active:scale-[0.97] disabled:opacity-60',
              destructive
                ? 'bg-danger text-white hover:opacity-90'
                : 'bg-accent text-accent-contrast hover:bg-accent-ink',
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    />
  )
}
