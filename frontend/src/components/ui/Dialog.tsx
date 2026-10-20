import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'

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

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-2xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
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
          'relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-xl border border-line',
          'bg-paper-overlay shadow-lg animate-sheet-up sm:rounded-xl',
          widths[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-serif text-lg text-ink-strong">{title}</h2>
            {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('entries.close')}
            className="-mr-1 -mt-1 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        {children ? <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div> : null}
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] sm:pb-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
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
  destructive?: boolean
  busy?: boolean
}) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3.5 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
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
              'rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:opacity-60',
              destructive
                ? 'bg-danger text-white hover:opacity-90'
                : 'bg-accent text-accent-contrast hover:bg-accent-ink',
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {description ? <p className="text-sm text-ink-muted">{description}</p> : null}
    </Dialog>
  )
}
