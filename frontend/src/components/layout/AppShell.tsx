import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { useAuth } from '../../state/auth'
import { useFolders } from '../../hooks/useFolders'
import { NewFolderForm } from '../entries/NewFolderForm'
import {
  ChartIcon,
  FolderIcon,
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
  { to: '/insights', labelKey: 'nav.insights', icon: ChartIcon },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  // The compact title in the bar only appears once the large title in the
  // page has scrolled away, the way the native app does it.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 28)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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

      {/* --- mobile top bar --- */}
      <header className="glass-bar safe-top fixed inset-x-0 top-0 z-40 border-b border-line/50 lg:hidden">
        <div className="flex h-14 items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={t('nav.openMenu')}
            aria-expanded={menuOpen}
            className="flex size-9 items-center justify-center rounded-full text-ink transition-colors active:bg-paper-sunken"
          >
            <MenuIcon size={21} />
          </button>
          <span
            className={cn(
              'flex-1 truncate text-[1.0625rem] font-semibold tracking-tight text-ink-strong transition-opacity duration-200',
              scrolled ? 'opacity-100' : 'opacity-0',
            )}
          >
            <CompactTitle />
          </span>
        </div>
      </header>

      {menuOpen && !isDesktop ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/25 animate-fade-in"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="glass-bar relative flex h-full w-72 max-w-[85vw] flex-col border-r border-line animate-fade-in">
            <div className="flex h-14 items-center justify-between px-5 safe-top">
              <span className="font-display text-[1.0625rem] font-bold text-ink-strong">
                {t('app.name')}
              </span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label={t('nav.closeMenu')}
                className="flex size-8 items-center justify-center rounded-full text-ink-muted active:bg-paper-sunken"
              >
                <svg viewBox="0 0 20 20" className="size-5" fill="none" aria-hidden="true">
                  <path
                    d="M5 5l10 10M15 5L5 15"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <SidebarNav />
          </div>
        </div>
      ) : null}

      {/* --- content --- */}
      <main className="pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] lg:ml-72 lg:pb-0">
        <div className="mx-auto w-full max-w-3xl px-4 pt-[calc(var(--header-h)+1rem)] sm:px-6 lg:max-w-4xl lg:pt-10">
          {children}
        </div>
      </main>

      {/* --- mobile bottom navigation --- */}
      <nav className="glass-bar safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line/50 lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around px-1 pt-1.5 pb-1">
          {primaryLinks.map((link) => (
            <TabLink key={link.to} {...link} />
          ))}
        </div>
      </nav>
    </div>
  )
}

/** The name of the section the reader is in, shown in the collapsed bar. */
function CompactTitle() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { folderId } = useParams()
  const { folders } = useFolders()

  return (
    <>
      {folderId ? (
        folders.find((folder) => folder.id === Number(folderId))?.name ?? t('nav.timeline')
      ) : pathname.startsWith('/search') ? (
        t('nav.search')
      ) : pathname.startsWith('/insights') ||
        pathname.startsWith('/calendar') ||
        pathname.startsWith('/map') ? (
        t('nav.insights')
      ) : pathname.startsWith('/settings') ? (
        t('nav.settings')
      ) : pathname.startsWith('/new') ? (
        t('entries.newEntry')
      ) : pathname.startsWith('/entries') ? (
        t('nav.timeline')
      ) : (
        t('nav.timeline')
      )}
    </>
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
          'flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[0.625rem] font-semibold transition-colors',
          isActive ? 'text-accent' : 'text-ink-faint',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
              isActive ? 'bg-accent-soft' : 'bg-transparent',
            )}
          >
            <Icon size={21} />
          </span>
          <span className="truncate">{t(labelKey)}</span>
        </>
      )}
    </NavLink>
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

/** The floating action button that starts a new entry. */
export function NewEntryButton() {
  const { t } = useTranslation()
  return (
    <NavLink
      to="/new"
      aria-label={t('nav.newEntry')}
      className={cn(
        'fixed right-4 z-30 flex size-14 items-center justify-center rounded-full text-white',
        'shadow-float transition-transform duration-150 active:scale-95',
        'bottom-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] lg:bottom-8 lg:right-8',
      )}
      style={{ background: 'linear-gradient(160deg, #7b7ae4 0%, #4f4cc4 100%)' }}
    >
      <PlusIcon size={26} strokeWidth={2} />
    </NavLink>
  )
}
