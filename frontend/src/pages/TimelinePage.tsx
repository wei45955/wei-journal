import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { dayHeading, displayTimezone, localDateKey } from '../lib/format'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { useTimeline } from '../state/timeline'
import { useFolders } from '../hooks/useFolders'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { EntryCard } from '../components/entries/EntryCard'
import { FilterBar } from '../components/entries/FilterBar'
import { BulkBar } from '../components/entries/BulkBar'
import { filtersToQuery, hasActiveFilters } from '../components/entries/filters'
import type { TimelineFilters } from '../components/entries/filters'
import { BackButton, IconButton, TopBar } from '../components/layout/TopBar'
import { NewEntryButton } from '../components/layout/AppShell'
import { Menu } from '../components/layout/Menu'
import { MediaGallery } from '../components/media/MediaViewer'
import {
  FilterIcon,
  FolderIcon,
  GridIcon,
  MoreIcon,
  SearchIcon,
  SelectIcon,
  SortIcon,
} from '../components/icons'
import type { Entry, Media } from '../lib/types'

const PAGE_SIZE = 30

/** The folder named by the address, or undefined when the address names none. */
function folderFromPath(raw: string | undefined): number | 'none' | undefined {
  if (raw === undefined) return undefined
  if (raw === 'none') return 'none'
  if (!/^\d+$/.test(raw)) return undefined
  return Number(raw)
}

export function TimelinePage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { describe } = useToast()
  const { folders } = useFolders()
  const { filters, setFilters, order, setOrder, rememberScroll, takeScroll } = useTimeline()
  const params = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const rawFolder = params.folderId
  const routeFolderId = folderFromPath(rawFolder)
  const invalidFolder = rawFolder !== undefined && routeFolderId === undefined

  const [entries, setEntries] = useState<Entry[]>([])
  const [cursor, setCursor] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [gallery, setGallery] = useState<{ items: Media[]; index: number } | null>(null)

  const language = user?.settings.language ?? 'en'
  const zone = displayTimezone(user?.settings.timezone)

  // The address is the source of truth for the folder: "/" is every entry,
  // "/folders/12" is one folder and "/folders/none" is the entries that are
  // in no folder. The rest of the filters live in the timeline state.
  const effectiveFilters = useMemo<TimelineFilters>(
    () => ({ ...filters, folderId: routeFolderId }),
    [filters, routeFolderId],
  )

  // Keeping the state in step means returning to the timeline — or opening
  // the filters — still shows the folder in the address.
  useEffect(() => {
    if (invalidFolder) {
      navigate('/', { replace: true })
      return
    }
    setFilters((current) =>
      current.folderId === routeFolderId ? current : { ...current, folderId: routeFolderId },
    )
  }, [invalidFolder, navigate, routeFolderId, setFilters])

  const load = useCallback(
    async (nextCursor: string, replace: boolean) => {
      try {
        const result = await api.entries({
          ...filtersToQuery(effectiveFilters),
          order,
          limit: PAGE_SIZE,
          cursor: nextCursor || undefined,
        })
        setEntries((current) => (replace ? result.items : [...current, ...result.items]))
        setCursor(result.nextCursor)
        setHasMore(result.hasMore)
        setError('')
      } catch (err) {
        setError(describe(err, t('errors.generic')))
      }
    },
    [effectiveFilters, order, describe, t],
  )

  const restored = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // The address of the list as it is on the screen. The browser pulls the
  // page back to the top when the address changes, and that move must not
  // be taken for the place the reader left from.
  const ownPath = useRef(location.pathname)
  ownPath.current = location.pathname

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const result = await api.entries({
          ...filtersToQuery(effectiveFilters),
          order,
          limit: PAGE_SIZE,
        })
        if (cancelled) return
        setEntries(result.items)
        setCursor(result.nextCursor)
        setHasMore(result.hasMore)
        setError('')
      } catch (err) {
        if (!cancelled) setError(describe(err, t('errors.generic')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [effectiveFilters, order, describe, t])

  // The place in the list is restored once the entries are on the screen.
  useEffect(() => {
    if (loading || restored.current) return
    restored.current = true
    const top = takeScroll()
    if (top <= 0) return

    // The pictures that follow still have to arrive, and they make the page
    // longer. The place is kept as long as the page grows, so the reader
    // lands on the same entry as before.
    let height = document.body.scrollHeight
    const apply = () => window.scrollTo({ top, behavior: 'auto' })
    requestAnimationFrame(apply)
    const timer = window.setInterval(() => {
      const next = document.body.scrollHeight
      if (next === height) return
      height = next
      apply()
    }, 200)
    const stop = window.setTimeout(() => window.clearInterval(timer), 4000)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(stop)
    }
  }, [loading, takeScroll])

  // The place is remembered while the reader walks through the list.
  //
  // When the page changes, the browser pulls the list back to the top and
  // says so with a scroll of its own. That move is not the place the
  // reader left from, so it is only remembered while the list is still on
  // the screen.
  useLayoutEffect(() => {
    const onScroll = () => {
      if (!restored.current) return
      if (window.location.pathname !== ownPath.current) return
      rememberScroll(window.scrollY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [rememberScroll])

  // A new folder, filter or order starts the list at the top again, and
  // forgets where the old list was left.
  const signature = JSON.stringify([effectiveFilters, order])
  const lastSignature = useRef(signature)
  useEffect(() => {
    if (lastSignature.current === signature) return
    lastSignature.current = signature
    rememberScroll(0)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [signature, rememberScroll])

  const folderId = typeof routeFolderId === 'number' ? routeFolderId : undefined
  const currentFolder = folders.find((folder) => folder.id === folderId)
  const inFolder = routeFolderId !== undefined
  const folderTitle =
    routeFolderId === 'none' ? t('entries.noFolder') : currentFolder?.name

  const groups = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const entry of entries) {
      const key = localDateKey(new Date(entry.eventTime), zone)
      const list = map.get(key)
      if (list) list.push(entry)
      else map.set(key, [entry])
    }
    return Array.from(map.entries())
  }, [entries, zone])

  function selectFolder(next: number | 'none' | undefined) {
    setFilters((current) =>
      current.folderId === next ? current : { ...current, folderId: next },
    )
    const path = next === undefined ? '/' : `/folders/${next}`
    if (location.pathname !== path) navigate(path)
  }

  function toggleSelect(id: number) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    )
  }

  function exitSelection() {
    setSelecting(false)
    setSelected([])
  }

  async function handleBulkDone() {
    exitSelection()
    await load('', true)
  }

  const filtered = hasActiveFilters(effectiveFilters)

  const menuItems = useMemo(
    () => [
      {
        id: 'overview',
        label: t('nav.overview'),
        icon: <GridIcon size={17} />,
        onSelect: () => navigate('/overview'),
      },
      {
        id: 'select',
        label: selecting ? t('batch.clear') : t('batch.select'),
        icon: <SelectIcon size={17} />,
        onSelect: () => (selecting ? exitSelection() : setSelecting(true)),
      },
      {
        id: 'sort-desc',
        label: t('timeline.newestFirst'),
        icon: <SortIcon size={17} />,
        checked: order === 'desc',
        onSelect: () => setOrder('desc'),
      },
      {
        id: 'sort-asc',
        label: t('timeline.oldestFirst'),
        icon: <SortIcon size={17} />,
        checked: order === 'asc',
        onSelect: () => setOrder('asc'),
      },
      {
        id: 'filters',
        label: t('timeline.filters'),
        icon: <FilterIcon size={17} />,
        checked: filtersOpen,
        onSelect: () => setFiltersOpen((value) => !value),
      },
      {
        id: 'folder-all',
        label: t('timeline.allFolders'),
        icon: <FolderIcon size={17} />,
        checked: routeFolderId === undefined,
        onSelect: () => selectFolder(undefined),
      },
      {
        id: 'folder-none',
        label: t('entries.noFolder'),
        icon: <FolderIcon size={17} />,
        checked: routeFolderId === 'none',
        onSelect: () => selectFolder('none'),
      },
      ...folders.map((folder) => ({
        id: `folder-${folder.id}`,
        label: folder.name,
        icon: <FolderIcon size={17} />,
        checked: routeFolderId === folder.id,
        onSelect: () => selectFolder(folder.id),
      })),
    ],
    // selectFolder is built from the stable navigate and setFilters and the
    // current address; listing the values it reads keeps the menu honest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, selecting, order, filtersOpen, folders, routeFolderId, location.pathname, navigate, setFilters],
  )

  return (
    <div ref={rootRef} className="animate-page-in pb-24">
      <TopBar
        title={folderTitle ?? t('nav.timeline')}
        left={
          inFolder ? (
            <BackButton label={t('timeline.allFolders')} onClick={() => navigate('/')} />
          ) : undefined
        }
        actions={
          <>
            <IconButton label={t('nav.search')} onClick={() => navigate('/search')}>
              <SearchIcon size={20} />
            </IconButton>
            <Menu items={menuItems} label={t('common.more')}>
              {(props) => (
                <IconButton {...props} label={t('common.more')}>
                  <MoreIcon size={20} />
                </IconButton>
              )}
            </Menu>
          </>
        }
      />

      <header className="pt-3 pb-3">
        <h1 className="title-large text-ink-strong">{folderTitle ?? t('nav.timeline')}</h1>
        {currentFolder ? (
          <p className="mt-1 text-sm text-ink-muted">
            {currentFolder.entryCount === 1
              ? t('folders.oneEntry')
              : t('folders.entries', { count: currentFolder.entryCount })}
          </p>
        ) : null}
      </header>

      <FilterBar
        filters={effectiveFilters}
        onChange={setFilters}
        onFolderChange={selectFolder}
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
      />

      {loading ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-40 w-full rounded-[1.375rem]" />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load('', true)} />
      ) : entries.length === 0 ? (
        <EmptyState
          title={filtered ? t('entries.empty.filtered') : t('entries.empty.title')}
          body={filtered ? t('entries.empty.filteredBody') : t('entries.empty.body')}
        />
      ) : (
        <>
          <div className="flex flex-col gap-7">
            {groups.map(([date, group]) => (
              <section key={date} aria-label={dayHeading(date, language, zone)}>
                <h2 className="mb-2.5 px-1 text-sm font-semibold tracking-wide text-ink-faint">
                  {dayHeading(date, language, zone)}
                </h2>
                <div className="flex flex-col gap-2.5">
                  {group.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      language={language}
                      timeZone={zone}
                      selectable={selecting}
                      selected={selected.includes(entry.id)}
                      onToggleSelect={toggleSelect}
                      onOpenMedia={(_, index) => {
                        const pictures = (entry.media ?? []).filter(
                          (item) => item.kind === 'image' || item.kind === 'live-still',
                        )
                        setGallery({ items: pictures, index })
                      }}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {hasMore ? (
            <div className="mt-6 flex justify-center">
              <Button
                variant="secondary"
                loading={loadingMore}
                onClick={async () => {
                  setLoadingMore(true)
                  await load(cursor, false)
                  setLoadingMore(false)
                }}
              >
                {t('entries.loadMore')}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {selecting ? (
        <BulkBar selected={selected} onClear={exitSelection} onDone={() => void handleBulkDone()} />
      ) : (
        <NewEntryButton />
      )}

      {gallery ? (
        <MediaGallery
          items={gallery.items}
          index={gallery.index}
          onIndexChange={(index) => setGallery({ ...gallery, index })}
          onClose={() => setGallery(null)}
        />
      ) : null}
    </div>
  )
}
