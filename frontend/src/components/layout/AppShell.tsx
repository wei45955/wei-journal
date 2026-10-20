import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useAuth } from '../../state/auth'
import { useFolders } from '../../hooks/useFolders'
import {
  CalendarIcon,
  FolderIcon,
  MapIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TimelineIcon,
} from '../icons'
import { useMediaQuery } from '../../hooks/useMediaQuery'

const primaryLinks = [
  { to: '/', labelKey: 'nav.timeline', icon: TimelineIcon, end: true },
  { to: '/search', labelKey: 'nav.search', icon: SearchIcon },
  { to: '/calendar', labelKey: 'nav.calendar', icon: CalendarIcon },
  { to: '/map', labelKey: 'nav.map', icon: MapIcon },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-paper text-ink">
      {/* --- desktop sidebar --- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-paper-raised/60 lg:flex">
        <div className="flex h-16 items-center px-6">
          <span className="font-serif text-lg tracking-tight text-ink-strong">{t('app.name')}</span>
        </div>
        <SidebarNav />
      </aside>

      {/* --- mobile top bar --- */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-paper/85 px-3 backdrop-blur-md safe-top lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={t('nav.openMenu')}
          aria-expanded={menuOpen}
          className="rounded-md p-2 text-ink-muted transition-colors hover:bg-paper-sunken hover:text-ink"
        >
          <MenuIcon size={22} />
        </button>
        <span className="flex-1 truncate font-serif text-base text-ink-strong">{t('app.name')}</span>
      </header>

      {menuOpen && !isDesktop ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/30 animate-fade-in"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-line bg-paper animate-fade-in">
            <div className="flex h-14 items-center justify-between px-5">
              <span className="font-serif text-base text-ink-strong">{t('app.name')}</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t('nav.closeMenu')}
                className="rounded-md p-2 text-ink-muted hover:bg-paper-sunken"
              >
                <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <SidebarNav />
          </div>
        </div>
      ) : null}

      {/* --- content --- */}
      <main className="pb-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] lg:ml-64 lg:pb-0">
        <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 sm:pt-8 lg:max-w-4xl">{children}</div>
      </main>

      {/* --- mobile bottom navigation --- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/90 backdrop-blur-md safe-bottom lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-2">
          {primaryLinks.slice(0, 2).map((link) => (
            <TabLink key={link.to} {...link} />
          ))}
          <div className="w-16" />
          {primaryLinks.slice(2).map((link) => (
            <TabLink key={link.to} {...link} />
          ))}
        </div>
      </nav>
    </div>
  )
}

function TabLink({
  to,
  labelKey,
  icon: Icon,
  end,
}: {
  to: string
  labelKey: string
  icon: typeof TimelineIcon
  end?: boolean
}) {
  const { t } = useTranslation()
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.6875rem] font-medium transition-colors',
          isActive ? 'text-accent' : 'text-ink-faint hover:text-ink-muted',
        )
      }
    >
      <Icon size={21} />
      <span className="truncate">{t(labelKey)}</span>
    </NavLink>
  )
}

function SidebarNav() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { folders } = useFolders()

  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 pb-6">
      <ul className="flex flex-col gap-0.5">
        {primaryLinks.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-[0.9375rem] transition-colors',
                  isActive
                    ? 'bg-accent-soft text-accent-ink font-medium'
                    : 'text-ink-muted hover:bg-paper-sunken hover:text-ink',
                )
              }
            >
              <link.icon size={19} />
              {t(link.labelKey)}
            </NavLink>
          </li>
        ))}
      </ul>

      {folders.length > 0 ? (
        <div>
          <h2 className="px-3 pb-1.5 text-xs font-semibold tracking-wide text-ink-faint uppercase">
            {t('nav.folders')}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {folders.map((folder) => (
              <li key={folder.id}>
                <NavLink
                  to={`/folders/${folder.id}`}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-[0.9375rem] transition-colors',
                      isActive
                        ? 'bg-accent-soft text-accent-ink font-medium'
                        : 'text-ink-muted hover:bg-paper-sunken hover:text-ink',
                    )
                  }
                >
                  <FolderIcon size={18} />
                  <span className="min-w-0 flex-1 truncate">{folder.name}</span>
                  <span className="text-xs text-ink-faint tabular-nums">{folder.entryCount}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-auto">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-[0.9375rem] transition-colors',
              isActive
                ? 'bg-accent-soft text-accent-ink font-medium'
                : 'text-ink-muted hover:bg-paper-sunken hover:text-ink',
            )
          }
        >
          <SettingsIcon size={19} />
          {t('nav.settings')}
        </NavLink>
        {user ? (
          <p className="mt-2 truncate px-3 text-xs text-ink-faint">
            {user.username}
            {user.role === 'admin' ? ` · ${t('settings.admin')}` : ''}
          </p>
        ) : null}
      </div>
    </nav>
  )
}

/** The floating action button that starts a new entry. */
export function NewEntryButton() {
  const { t } = useTranslation()
  return (
    <NavLink
      to="/new"
      aria-label={t('nav.newEntry')}
      className={cn(
        'fixed right-5 z-30 flex size-14 items-center justify-center rounded-full bg-accent text-accent-contrast',
        'shadow-lg transition-transform duration-150 hover:bg-accent-ink active:scale-95',
        'bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] lg:bottom-8 lg:right-8',
      )}
    >
      <PlusIcon size={26} />
    </NavLink>
  )
}
