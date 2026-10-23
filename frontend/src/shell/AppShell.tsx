import { Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { useAuth } from '../state/auth'
import { useFolders } from '../state/library'
import { ArchiveIcon, BookIcon, GearIcon, InboxIcon, PenIcon, PlaceIcon, SearchIcon, FolderIcon } from '../ui/icons'

const TABS = [
  { to: '/', key: 'nav.journal', icon: BookIcon, match: (path: string) => path === '/' || path.startsWith('/folder/') },
  { to: '/archive', key: 'nav.archive', icon: ArchiveIcon, match: (path: string) => path.startsWith('/archive') },
  { to: '/places', key: 'nav.places', icon: PlaceIcon, match: (path: string) => path.startsWith('/places') },
  { to: '/search', key: 'nav.search', icon: SearchIcon, match: (path: string) => path.startsWith('/search') },
]

/** The pages that carry the tab bar. Pushed pages (an entry, the editor) do not. */
function isTabPage(path: string) {
  return TABS.some((tab) => tab.match(path))
}

/**
 * Which page an address shows. A new entry's address changes once it is
 * first saved, but it is still the same editor and must not be rebuilt.
 */
function pageKeyOf(path: string) {
  return /^\/(write|entry\/\d+\/edit)\/?$/.test(path) ? 'editor' : path
}

const scrollPlaces = new Map<string, number>()

/**
 * A new page opens at its top; a page that is returned to opens where it was
 * left. Because the data of a visited page is cached, the place can be set
 * before the first paint.
 */
function useScrollMemory() {
  const location = useLocation()
  const type = useNavigationType()
  const keyRef = useRef(location.key)
  const page = pageKeyOf(location.pathname)

  useEffect(() => {
    history.scrollRestoration = 'manual'
    const remember = () => scrollPlaces.set(keyRef.current, window.scrollY)
    window.addEventListener('scroll', remember, { passive: true })
    return () => window.removeEventListener('scroll', remember)
  }, [])

  useLayoutEffect(() => {
    keyRef.current = location.key
    const target = type === 'POP' ? (scrollPlaces.get(location.key) ?? 0) : 0
    window.scrollTo(0, target)
    if (target <= 0) return
    // Pictures further down may still be arriving; hold the place briefly.
    let frames = 0
    let frame = requestAnimationFrame(function hold() {
      if (Math.abs(window.scrollY - target) > 2) window.scrollTo(0, target)
      frames += 1
      if (frames < 20) frame = requestAnimationFrame(hold)
    })
    const stop = () => cancelAnimationFrame(frame)
    window.addEventListener('touchstart', stop, { once: true, passive: true })
    window.addEventListener('wheel', stop, { once: true, passive: true })
    return () => {
      stop()
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('wheel', stop)
    }
    // Only a change of page moves the reader; new search words do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])
}

export function AppShell() {
  const location = useLocation()
  useScrollMemory()
  const tabs = isTabPage(location.pathname)

  return (
    <div className="min-h-dvh lg:pl-[17rem]">
      <Sidebar />
      <main
        className={cn(
          'mx-auto w-full max-w-[44rem] px-5 sm:px-8 lg:px-10',
          tabs ? 'pb-[calc(env(safe-area-inset-bottom)+7rem)] lg:pb-16' : 'pb-[calc(env(safe-area-inset-bottom)+2rem)]',
        )}
      >
        <Suspense fallback={<div className="min-h-dvh" />}>
          <div key={pageKeyOf(location.pathname)} className="animate-rise">
            <Outlet />
          </div>
        </Suspense>
      </main>
      {tabs ? <TabBar /> : null}
    </div>
  )
}

/** The thumb-reach navigation of the phone: four places and the pen. */
function TabBar() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const folderMatch = /^\/folder\/([^/]+)/.exec(pathname)
  const writeTo = folderMatch && folderMatch[1] !== 'none' ? `/write?folder=${folderMatch[1]}` : '/write'

  return (
    <nav
      aria-label={t('nav.main')}
      className="tabbar fixed inset-x-0 bottom-0 z-50 flex items-end justify-center gap-3 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="glass flex h-[62px] flex-1 items-center justify-around rounded-full px-1.5 shadow-float sm:max-w-[26rem] sm:flex-none sm:gap-2">
        {TABS.map((tab) => {
          const active = tab.match(pathname)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              replace={active}
              onClick={() => {
                if (active) window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'press flex h-[52px] min-w-[3.75rem] flex-col items-center justify-center gap-[3px] rounded-full px-2 sm:px-4',
                active ? 'text-accent' : 'text-ink-2',
              )}
            >
              <tab.icon size={23} strokeWidth={active ? 1.9 : 1.6} className="transition-[stroke-width] duration-200" />
              <span className="text-[0.6875rem] leading-none font-medium">{t(tab.key)}</span>
            </Link>
          )
        })}
      </div>
      <Link
        to={writeTo}
        aria-label={t('nav.write')}
        className="press flex size-[62px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-on shadow-float"
      >
        <PenIcon size={25} strokeWidth={1.8} />
      </Link>
    </nav>
  )
}

/** The wide-screen navigation, with the folders always in view. */
function Sidebar() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { folders } = useFolders()
  const { pathname } = useLocation()

  const row = (active: boolean) =>
    cn(
      'flex h-10 items-center gap-3 rounded-[12px] px-3 text-[0.9375rem] transition-colors',
      active ? 'bg-leaf font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'text-ink-2 hover:text-ink',
    )

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[17rem] flex-col border-r border-rule px-4 pt-7 pb-5 lg:flex">
      <div className="px-3 font-serif text-[1.5rem] font-medium text-ink [font-variation-settings:'opsz'_48]">
        {t('app.name')}
      </div>
      <Link
        to="/write"
        className="press mt-6 flex h-11 items-center justify-center gap-2 rounded-full bg-accent text-[0.9375rem] font-semibold text-accent-on"
      >
        <PenIcon size={19} />
        {t('nav.write')}
      </Link>

      <nav aria-label={t('nav.main')} className="mt-6 flex flex-col gap-0.5">
        {TABS.map((tab) => (
          <Link key={tab.to} to={tab.to} className={row(tab.match(pathname) && !pathname.startsWith('/folder/'))}>
            <tab.icon size={20} />
            {t(tab.key)}
          </Link>
        ))}
      </nav>

      <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
        <p className="px-3 pb-1.5 text-[0.8125rem] text-ink-3">{t('settings.folders')}</p>
        <div className="flex flex-col gap-0.5">
          <NavLink to="/folder/none" className={({ isActive }) => row(isActive)}>
            <InboxIcon size={19} />
            <span className="flex-1 truncate">{t('timeline.unfiled')}</span>
          </NavLink>
          {folders.map((folder) => (
            <NavLink key={folder.id} to={`/folder/${folder.id}`} className={({ isActive }) => row(isActive)}>
              <FolderIcon size={19} />
              <span className="flex-1 truncate">{folder.name}</span>
              <span className="tnum text-[0.8125rem] text-ink-3">{folder.entryCount}</span>
            </NavLink>
          ))}
        </div>
      </div>

      <NavLink to="/settings" className={({ isActive }) => cn(row(isActive), 'mt-3')}>
        <GearIcon size={20} />
        <span className="flex-1 truncate">{t('nav.settings')}</span>
        <span className="max-w-[6rem] truncate text-[0.8125rem] text-ink-3">{user?.username}</span>
      </NavLink>
    </aside>
  )
}
