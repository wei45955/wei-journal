import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useAuth } from '../../state/auth'
import { useFolders } from '../../hooks/useFolders'
import { NewFolderForm } from '../entries/NewFolderForm'
import {
  ChartIcon,
  FolderIcon,
  GridIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TimelineIcon,
} from '../icons'

const primaryLinks = [
  { to: '/', labelKey: 'nav.timeline', icon: TimelineIcon, end: true },
  { to: '/search', labelKey: 'nav.search', icon: SearchIcon },
  { to: '/insights', labelKey: 'nav.insights', icon: ChartIcon },
  { to: '/overview', labelKey: 'nav.overview', icon: GridIcon },
]

/**
 * How far each visited page was scrolled, keyed by the history entry so a
 * page that is returned to opens where it was left.
 */
const scrollPlaces = new Map<string, number>()

/**
 * Every new page starts at its own top, but a page that is returned to —
 * the list of results behind an entry, the insights behind a photo — opens
 * at the place it was left. The browser's own restoration is switched off
 * because the page is written before its content has arrived, and the
 * browser would put the reader at the bottom of a list that is momentarily
 * short.
 */
function useScrollPlaces() {
  const { pathname, key } = useLocation()
  const activeKey = useRef(key)
  activeKey.current = key
  const page = useRef(pathname)

  useEffect(() => {
    const previous = history.scrollRestoration
    history.scrollRestoration = 'manual'
    const remember = () => scrollPlaces.set(activeKey.current, window.scrollY)
    window.addEventListener('scroll', remember, { passive: true })
    return () => {
      history.scrollRestoration = previous
      window.removeEventListener('scroll', remember)
    }
  }, [])

  useLayoutEffect(() => {
    // Only a new page moves the reader; changing the words of a search or
    // the filters of a list rewrites the address but stays on the page.
    if (page.current === pathname) return
    page.current = pathname

    const target = scrollPlaces.get(key)
    if (!target) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      return
    }

    // The pictures and entries of the page still have to arrive and make
    // it longer, so the place is restored for as long as it keeps growing.
    let height = document.body.scrollHeight
    const apply = () => window.scrollTo({ top: target, behavior: 'auto' })
    const frame = requestAnimationFrame(apply)
    const timer = window.setInterval(() => {
      const next = document.body.scrollHeight
      if (next === height) return
      height = next
      apply()
    }, 200)
    const stop = () => {
      window.clearInterval(timer)
      window.clearTimeout(limit)
    }
    const limit = window.setTimeout(stop, 3000)
    // Touching the screen means the reader has taken over; the page must
    // never pull itself away under their finger.
    window.addEventListener('touchstart', stop, { passive: true, once: true })
    window.addEventListener('wheel', stop, { passive: true, once: true })

    return () => {
      cancelAnimationFrame(frame)
      stop()
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('wheel', stop)
    }
  }, [pathname, key])
}

/**
 * The frame of the application.
 *
 * On a phone the page fills the whole screen and the bar of the page draws
 * the way back and the actions. The wide layout keeps a sidebar, because
 * there is room for it there.
 */
export function AppShell() {
  const { t } = useTranslation()

  useScrollPlaces()

  return (
    <div className="min-h-dvh bg-paper text-ink">
      {/* --- desktop sidebar --- */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-line bg-paper-raised/70 backdrop-blur-xl lg:flex">
        <div className="flex h-20 items-center px-7">
          <span className="font-display text-[1.375rem] font-bold tracking-tight text-ink-strong">
            {t('app.name')}
          </span>
        </div>
        <SidebarNav />
      </aside>

      {/* --- content --- */}
      <main className="pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] lg:ml-72 lg:pb-0">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:max-w-4xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function SidebarNav() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { folders } = useFolders()
  const [addingFolder, setAddingFolder] = useState(false)

  const items = useMemo(
    () =>
      primaryLinks.map((link) => (
        <li key={link.to}>
          <NavLink
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.9375rem] font-medium transition-colors',
                isActive
                  ? 'bg-accent-soft text-accent-ink'
                  : 'text-ink-muted hover:bg-paper-sunken hover:text-ink',
              )
            }
          >
            <link.icon size={20} />
            {t(link.labelKey)}
          </NavLink>
        </li>
      )),
    [t],
  )

  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6">
      <ul className="flex flex-col gap-1">{items}</ul>

      <div>
        <div className="flex items-center justify-between gap-2 px-3.5 pb-1.5">
          <h2 className="text-[0.6875rem] font-semibold tracking-wide text-ink-faint uppercase">
            {t('nav.folders')}
          </h2>
          <button
            type="button"
            onClick={() => setAddingFolder((open) => !open)}
            aria-label={t('folders.new')}
            aria-expanded={addingFolder}
            className="flex size-6 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-paper-sunken hover:text-ink"
          >
            <PlusIcon size={15} />
          </button>
        </div>
        {addingFolder ? (
          <NewFolderForm className="mb-2 px-1" onCreated={() => setAddingFolder(false)} />
        ) : null}
        {folders.length === 0 ? (
          <p className="px-3.5 text-xs text-ink-faint">{t('folders.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {folders.map((folder) => (
              <li key={folder.id}>
                <NavLink
                  to={`/folders/${folder.id}`}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.9375rem] transition-colors',
                      isActive
                        ? 'bg-accent-soft text-accent-ink font-medium'
                        : 'text-ink-muted hover:bg-paper-sunken hover:text-ink',
                    )
                  }
                >
                  <FolderIcon size={19} />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="text-xs text-ink-faint tabular-nums">{folder.entryCount}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.9375rem] transition-colors',
              isActive
                ? 'bg-accent-soft text-accent-ink font-medium'
                : 'text-ink-muted hover:bg-paper-sunken hover:text-ink',
            )
          }
        >
          <SettingsIcon size={20} />
          {t('nav.settings')}
        </NavLink>
        {user ? (
          <p className="mt-2 truncate px-3.5 text-xs text-ink-faint">
            {user.username}
            {user.role === 'admin' ? ` · ${t('settings.admin')}` : ''}
          </p>
        ) : null}
      </div>
    </nav>
  )
}

/**
 * The floating action button that starts a new entry. It sits above the
 * home indicator of the phone and never over the last card of the list.
 */
export function NewEntryButton() {
  const { t } = useTranslation()
  return (
    <NavLink
      to="/new"
      aria-label={t('nav.newEntry')}
      className={cn(
        'fixed right-4 z-30 flex size-14 items-center justify-center rounded-full',
        'bg-accent text-accent-contrast shadow-float',
        'transition-transform duration-150 hover:scale-[1.03] active:scale-95',
        'bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] lg:bottom-8 lg:right-8',
      )}
    >
      <PlusIcon size={26} strokeWidth={2} />
    </NavLink>
  )
}
