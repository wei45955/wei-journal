/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { ChevronLeftIcon } from '../ui/icons'

export function useScrolled(threshold = 8): boolean {
  const [scrolled, setScrolled] = useState(() => typeof window !== 'undefined' && window.scrollY > threshold)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [threshold])
  return scrolled
}

/**
 * The bar at the top of a page. It is transparent over the page title and
 * turns to frosted glass, with the title, once the page scrolls under it.
 */
export function TopBar({
  title,
  leading,
  trailing,
  alwaysTitle = false,
  collapseAt = 56,
}: {
  title?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  /** Shows the small title even before the page scrolls. */
  alwaysTitle?: boolean
  collapseAt?: number
}) {
  const scrolled = useScrolled(collapseAt)
  const showTitle = alwaysTitle || scrolled
  return (
    <header
      className={cn(
        'sticky top-0 z-40 -mx-5 px-2 pt-[env(safe-area-inset-top)] transition-[background-color,box-shadow] duration-200 sm:-mx-8 sm:px-5 lg:-mx-10 lg:px-7',
        scrolled ? 'glass shadow-[0_0.5px_0_var(--wj-rule)]' : 'bg-transparent',
      )}
    >
      <div className="relative flex h-[52px] items-center gap-1">
        <div className="relative z-10 flex min-w-11 items-center">{leading}</div>
        <div
          className={cn(
            'pointer-events-none absolute inset-x-24 truncate text-center text-[1rem] font-semibold text-ink transition-opacity duration-200',
            showTitle ? 'opacity-100' : 'opacity-0',
          )}
          aria-hidden={!showTitle}
        >
          {title}
        </div>
        <div className="relative z-10 ml-auto flex items-center gap-0.5">{trailing}</div>
      </div>
    </header>
  )
}

/**
 * Steps back in the app's own history, or to `fallback` when the page was
 * opened directly and there is nothing to go back to.
 */
export function useBack(fallback = '/') {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (location.key === 'default' || window.history.state?.idx === 0) navigate(fallback, { replace: true })
    else navigate(-1)
  }
}

export function BackButton({ fallback = '/', label }: { fallback?: string; label?: string }) {
  const { t } = useTranslation()
  const back = useBack(fallback)
  return (
    <button
      type="button"
      onClick={back}
      aria-label={label ?? t('nav.back')}
      className="press -ml-1 flex h-11 items-center rounded-full pr-3 pl-1 text-accent"
    >
      <ChevronLeftIcon size={26} strokeWidth={1.9} />
      {label ? <span className="max-w-[9rem] truncate text-[1rem]">{label}</span> : null}
    </button>
  )
}

/** The large page title that the bar takes over when it scrolls away. */
export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="pt-1 pb-4">
      <h1 className="font-serif text-[2.125rem] leading-[1.1] font-medium tracking-[-0.01em] text-ink [font-variation-settings:'opsz'_60]">
        {children}
      </h1>
      {sub ? <div className="mt-1.5 text-[0.9375rem] text-ink-2">{sub}</div> : null}
    </div>
  )
}
