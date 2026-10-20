/**
 * The menu that hangs from a button in the bar.
 *
 * It is drawn in the document, so it never inherits the shape of the page
 * it was opened from, and it is placed next to the button that opened it.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn'

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  /** Marks the item as the current choice. */
  checked?: boolean
  /** Makes the item red. */
  destructive?: boolean
  disabled?: boolean
  onSelect: () => void
}

interface MenuProps {
  items: MenuItem[]
  /** The name of the button, used as the label of the trigger. */
  label: string
  /** The trigger. It receives the props it has to spread on the button. */
  children: (props: {
    onClick: () => void
    'aria-expanded': boolean
    'aria-haspopup': 'menu'
    ref: (node: HTMLButtonElement | null) => void
  }) => ReactNode
}

export function Menu({ items, label, children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // The panel is placed under the button, and pulled inside the window when
  // there is not enough room.
  useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const width = Math.min(280, window.innerWidth - 16)
    let left = rect.right - width
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    setPosition({ top: rect.bottom + 8, left })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onScroll = () => setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return (
    <>
      {children({
        onClick: () => setOpen((value) => !value),
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        ref: (node) => {
          triggerRef.current = node
        },
      })}

      {open
        ? createPortal(
            <div
              ref={panelRef}
              role="menu"
              aria-label={label}
              className="fixed z-[60] min-w-[13rem] overflow-hidden rounded-2xl border border-line bg-paper-overlay py-1.5 shadow-lift animate-sheet-up"
              style={{ top: position.top, left: position.left, maxWidth: 'calc(100vw - 16px)' }}
            >
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false)
                    item.onSelect()
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left text-[0.9375rem] transition-colors',
                    'disabled:opacity-40',
                    item.destructive
                      ? 'text-danger hover:bg-danger-soft'
                      : 'text-ink hover:bg-paper-sunken',
                  )}
                >
                  {item.icon ? (
                    <span className="flex size-5 shrink-0 items-center justify-center text-ink-muted">
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.checked ? (
                    <svg viewBox="0 0 24 24" className="size-4 shrink-0 text-accent" fill="none" aria-hidden="true">
                      <path
                        d="M5 12.5l4.5 4.5L19 7"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
