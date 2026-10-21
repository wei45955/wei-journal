/**
 * The bar that sits at the top of every page.
 *
 * It is the frame of the application: the same height, the same spacing and
 * the same place for the actions, so moving from one page to the next never
 * moves the controls under the finger.
 *
 * The left side holds the way back, the middle holds the name of the page
 * once it is scrolled away, and the right side holds the actions of the
 * page that is open.
 */

import { useEffect, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface TopBarProps {
  /** The name of the page. It fades in once the large title has scrolled away. */
  title?: ReactNode
  /** The control on the left, usually the way back. */
  left?: ReactNode
  /** The actions of the page, on the right. */
  actions?: ReactNode
  /** Hides the hairline under the bar. */
  plain?: boolean
}

export function TopBar({ title, left, actions, plain = false }: TopBarProps) {
  const [scrolled, setScrolled] = useState(false)

  // The compact title only appears once the large title of the page has
  // scrolled away, the way the native application does it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    // The bar runs to the edges of the screen, not just to the edges of
    // the page column: entries scrolling underneath must not peek past it.
    <header className="sticky top-0 z-40 -mx-4 sm:-mx-6">
      <div
        className={cn(
          'glass-bar border-b border-transparent transition-colors duration-200',
          // Once entries scroll underneath, the bar turns solid: a hint of
          // a headline behind it reads as a rendering fault, not as glass.
          scrolled ? 'bg-paper' : 'bg-paper/85',
          !plain && scrolled && 'border-line/60',
        )}
      >
        {/* The space the system draws in, so nothing hides behind it. */}
        <div className="h-[env(safe-area-inset-top,0px)]" aria-hidden="true" />
        <div className="relative flex h-12 items-center px-4 sm:px-6">
          <div className="relative z-10 flex w-12 shrink-0 items-center">{left}</div>

          <div className="pointer-events-none absolute inset-x-16 flex justify-center px-1">
            <span
              className={cn(
                'block max-w-full truncate text-[0.9375rem] font-semibold tracking-tight text-ink-strong',
                'transition-opacity duration-200',
                scrolled ? 'opacity-100' : 'opacity-0',
              )}
            >
              {title}
            </span>
          </div>

          <div className="relative z-10 ml-auto flex shrink-0 items-center gap-0.5">{actions}</div>
        </div>
      </div>
    </header>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The name of the action, used as the label and the tooltip. */
  label: string
  /** Whether the button is pressed, for a toggle. */
  pressed?: boolean
  /** Whether the button carries a destructive action. */
  danger?: boolean
}

/**
 * A round button of the bar. It keeps the same size on every page and on
 * every screen, so the actions never shift under the finger.
 */
export function IconButton({
  label,
  pressed,
  danger = false,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full transition-all duration-150',
        'active:scale-95 active:bg-paper-sunken disabled:opacity-40',
        danger
          ? 'text-danger hover:bg-danger-soft'
          : pressed
            ? 'bg-accent-soft text-accent-ink'
            : 'text-ink hover:bg-paper-sunken',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/**
 * The button that steps back to the page above. It always sits in the same
 * place, so the way back is always in the same place.
 */
export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-11 items-center justify-center rounded-full text-ink transition-all duration-150 active:scale-95 active:bg-paper-sunken hover:bg-paper-sunken"
    >
      <svg viewBox="0 0 24 24" className="size-[1.35rem]" fill="none" aria-hidden="true">
        <path
          d="M14.5 5.5L8 12l6.5 6.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
