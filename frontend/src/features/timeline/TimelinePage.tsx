import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { dayParts, displayTimezone, localDateKey, longDate, monthLabel } from '../../lib/format'
import type { Entry, Media } from '../../lib/types'
import { usePrefs } from '../../state/auth'
import { activeFilterCount, noFilters, toQuery, useJournal } from '../../state/journal'
import { useFolders, useTags } from '../../state/library'
import { useToast } from '../../state/toast'
import { TopBar } from '../../shell/TopBar'
import { Button, EmptyState, ErrorState, IconButton, Skeleton, Spinner } from '../../ui'
import { Seal } from '../../ui/Seal'
import { Menu } from '../../ui/Popover'
import { ChevronDownIcon, CloseIcon, FilterIcon, FolderIcon, GearIcon, MoreIcon, PenIcon, SelectIcon, SortIcon } from '../../ui/icons'
import { Viewer } from '../media/Viewer'
import { splitMedia } from '../media/Thumb'
import { BatchBar } from './BatchBar'
import { EntryCard } from './EntryCard'
import { FilterMenu } from './FilterMenu'
import { ScopeMenu, type Scope } from './ScopeMenu'
import { useEntryList } from './useEntryList'

function scopeFrom(raw: string | undefined): Scope | null {
  if (raw === undefined) return undefined
  if (raw === 'none') return 'none'
  return /^\d+$/.test(raw) ? Number(raw) : null
}

interface DayGroup {
  day: string
  entries: Entry[]
}
interface MonthGroup {
  month: string
  days: DayGroup[]
}

export function TimelinePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const params = useParams()
  const { language, zone: zoneSetting } = usePrefs()
  const zone = displayTimezone(zoneSetting)
  const { folders } = useFolders()
  const { tags } = useTags()
  const { describe } = useToast()
  const { filters, setFilters, order, setOrder } = useJournal()

  const scope = scopeFrom(params.folderId)
  useEffect(() => {
    if (scope === null) navigate('/', { replace: true })
  }, [scope, navigate])

  const query = useMemo(() => ({ ...toQuery(filters, scope ?? undefined), order }), [filters, scope, order])
  const list = useEntryList(query)
  const entries = useMemo(() => list.data?.items ?? [], [list.data])

  const [menu, setMenu] = useState<'scope' | 'filter' | 'more' | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [viewer, setViewer] = useState<{ entry: Entry; items: Media[]; index: number } | null>(null)

  // The panels open beside the control that asked for them.
  const filterRef = useRef<HTMLButtonElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const scopeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setSelecting(false)
    setSelected([])
  }, [scope])

  useEffect(() => {
    document.documentElement.toggleAttribute('data-hide-tabs', selecting)
    return () => document.documentElement.removeAttribute('data-hide-tabs')
  }, [selecting])

  const folder = typeof scope === 'number' ? folders.find((item) => item.id === scope) : undefined
  const title =
    scope === undefined ? t('timeline.allEntries') : scope === 'none' ? t('timeline.unfiled') : (folder?.name ?? '')
  const today = localDateKey(new Date(), zone)
  const filterCount = activeFilterCount(filters)

  const months = useMemo<MonthGroup[]>(() => {
    const result: MonthGroup[] = []
    for (const entry of entries) {
      const day = localDateKey(new Date(entry.eventTime), zone)
      const month = day.slice(0, 7)
      let monthGroup = result[result.length - 1]
      if (!monthGroup || monthGroup.month !== month) {
        monthGroup = { month, days: [] }
        result.push(monthGroup)
      }
      let dayGroup = monthGroup.days[monthGroup.days.length - 1]
      if (!dayGroup || dayGroup.day !== day) {
        dayGroup = { day, entries: [] }
        monthGroup.days.push(dayGroup)
      }
      dayGroup.entries.push(entry)
    }
    return result
  }, [entries, zone])

  const toggle = useCallback((id: number) => {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]))
  }, [])

  const openMedia = useCallback((entry: Entry, index: number) => {
    const { visual } = splitMedia(entry.media ?? [], entry.coverMediaId)
    setViewer({ entry, items: visual, index })
  }, [])

  // The next page is fetched as the end of the list comes into view.
  const sentinel = useRef<HTMLDivElement>(null)
  const { loadMore } = list
  const hasMore = list.data?.hasMore ?? false
  useEffect(() => {
    const element = sentinel.current
    if (!element || !hasMore) return
    const observer = new IntersectionObserver(
      (items) => items.some((item) => item.isIntersecting) && void loadMore(),
      { rootMargin: '900px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  function exitSelection() {
    setSelecting(false)
    setSelected([])
  }

  const allSelected = entries.length > 0 && selected.length === entries.length

  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]))
  const chips: Array<{ id: string; label: string; clear: () => void }> = []
  if (filters.tagIds.length) {
    chips.push({
      id: 'tags',
      label: filters.tagIds.map((id) => `#${tagNames.get(id) ?? id}`).join(filters.tagMode === 'all' ? ' + ' : ' / '),
      clear: () => setFilters({ ...filters, tagIds: [] }),
    })
  }
  if (filters.from || filters.to) {
    chips.push({
      id: 'dates',
      label: `${filters.from ?? '…'} – ${filters.to ?? '…'}`,
      clear: () => setFilters({ ...filters, from: undefined, to: undefined }),
    })
  }
  if (filters.mediaType) {
    chips.push({ id: 'kind', label: t(`filters.${filters.mediaType}`), clear: () => setFilters({ ...filters, mediaType: undefined }) })
  }
  if (filters.pinned) {
    chips.push({ id: 'pinned', label: t('timeline.pinned'), clear: () => setFilters({ ...filters, pinned: undefined }) })
  }

  return (
    <>
      <TopBar
        title={selecting ? t('batch.selected', { count: selected.length }) : title}
        alwaysTitle={selecting}
        leading={
          selecting ? (
            <button type="button" onClick={exitSelection} className="press h-11 rounded-lg px-2 text-base font-medium text-accent">
              {t('common.cancel')}
            </button>
          ) : null
        }
        trailing={
          selecting ? (
            <button
              type="button"
              onClick={() => setSelected(allSelected ? [] : entries.map((entry) => entry.id))}
              className="press h-11 rounded-lg px-2 text-base font-medium text-accent"
            >
              {allSelected ? t('batch.selectNone') : t('batch.selectAll')}
            </button>
          ) : (
            <>
              <IconButton
                ref={filterRef}
                label={t('timeline.filter')}
                active={filterCount > 0}
                onClick={() => setMenu(menu === 'filter' ? null : 'filter')}
              >
                <FilterIcon size={22} />
              </IconButton>
              <IconButton ref={moreRef} label={t('nav.more')} onClick={() => setMenu(menu === 'more' ? null : 'more')}>
                <MoreIcon size={22} />
              </IconButton>
            </>
          )
        }
      />

      {selecting ? (
        <p className="body-2 pt-1 pb-6 text-ink-2">{t('batch.prompt')}</p>
      ) : scope === undefined ? (
        <>
          <div className="flex items-center justify-between pt-1">
            <button
              ref={scopeRef}
              type="button"
              onClick={() => setMenu(menu === 'scope' ? null : 'scope')}
              className="press inline-flex h-9 max-w-full items-center gap-1 rounded-lg text-sm text-ink-2 hover:text-ink"
              aria-haspopup="dialog"
            >
              <span className="truncate">{title}</span>
              <ChevronDownIcon size={16} className="shrink-0 text-ink-3" />
            </button>
          </div>
          <TodayHero today={today} language={language} />
        </>
      ) : (
        <div className="flex items-start justify-between gap-4 pt-2 pb-8">
          <div className="min-w-0">
            <button
              ref={scopeRef}
              type="button"
              onClick={() => setMenu(menu === 'scope' ? null : 'scope')}
              className="press inline-flex max-w-full items-center gap-1.5 rounded-lg text-left"
              aria-haspopup="dialog"
            >
              <span className="heading-1 truncate text-ink">{title || '\u00a0'}</span>
              <ChevronDownIcon size={22} strokeWidth={1.7} className="mt-1 shrink-0 text-ink-3" />
            </button>
            {folder ? <p className="body-2 mt-2 text-ink-2">{t('timeline.count', { count: folder.entryCount })}</p> : null}
          </div>
          <Button
            tone="primary"
            size="sm"
            icon={<PenIcon size={16} />}
            onClick={() => navigate(typeof scope === 'number' ? `/write?folder=${scope}` : '/write')}
          >
            {t('nav.write')}
          </Button>
        </div>
      )}

      {chips.length > 0 ? (
        <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 no-scrollbar sm:mx-0 sm:px-0">
          {chips.map((chip) => (
            <span key={chip.id} className="flex h-8 shrink-0 items-center gap-0.5 rounded-md bg-accent-soft pr-1 pl-3 text-sm text-accent">
              <span className="max-w-[14rem] truncate">{chip.label}</span>
              <button type="button" aria-label={t('common.clear')} onClick={chip.clear} className="press flex size-6 items-center justify-center rounded">
                <CloseIcon size={14} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {list.loading ? (
        <TimelineSkeleton />
      ) : list.error && entries.length === 0 ? (
        <ErrorState message={describe(list.error)} onRetry={() => void list.reload()} />
      ) : entries.length === 0 ? (
        filterCount > 0 ? (
          <EmptyState
            title={t('timeline.emptyFilteredTitle')}
            body={t('timeline.emptyFilteredBody')}
            action={<Button onClick={() => setFilters(noFilters)}>{t('filters.clearAll')}</Button>}
          />
        ) : (
          <EmptyState
            title={scope === undefined ? t('timeline.emptyTitle') : t('timeline.emptyFolderTitle')}
            body={scope === undefined ? t('timeline.emptyBody') : t('timeline.emptyFolderBody')}
            action={
              scope === undefined ? undefined : (
                <Button tone="primary" onClick={() => navigate(typeof scope === 'number' ? `/write?folder=${scope}` : '/write')}>
                  {t('nav.write')}
                </Button>
              )
            }
          />
        )
      ) : (
        <div className="flex flex-col gap-10">
          {months.map((month, monthIndex) => (
            <section key={month.month} aria-label={monthLabel(month.month, language)}>
              {monthIndex > 0 || month.month !== today.slice(0, 7) ? (
                <div className="mb-4 flex items-baseline gap-3">
                  <h2 className="heading-3 text-ink-2">{monthLabel(month.month, language)}</h2>
                  <span aria-hidden="true" className="h-px flex-1 bg-rule" />
                </div>
              ) : null}
              <div className="flex flex-col gap-6">
                {month.days.map((group) => (
                  <DayRow
                    key={group.day}
                    group={group}
                    today={today}
                    language={language}
                    zone={zone}
                    selecting={selecting}
                    selected={selected}
                    onToggle={toggle}
                    onOpenMedia={openMedia}
                  />
                ))}
              </div>
            </section>
          ))}

          <div ref={sentinel} className="flex min-h-16 items-center justify-center">
            {list.loadingMore ? (
              <Spinner className="text-ink-3" />
            ) : list.moreError ? (
              <Button size="sm" onClick={() => void list.loadMore()}>
                {t('common.retry')}
              </Button>
            ) : hasMore ? (
              <Button size="sm" onClick={() => void list.loadMore()}>
                {t('timeline.older')}
              </Button>
            ) : (
              <p className="font-serif text-base text-ink-3">{t('timeline.end')}</p>
            )}
          </div>
        </div>
      )}

      <ScopeMenu
        open={menu === 'scope'}
        onClose={() => setMenu(null)}
        anchorRef={scopeRef}
        scope={scope ?? undefined}
      />
      <FilterMenu
        open={menu === 'filter'}
        onClose={() => setMenu(null)}
        anchorRef={filterRef}
        value={filters}
        onApply={setFilters}
      />
      <Menu
        open={menu === 'more'}
        onClose={() => setMenu(null)}
        anchorRef={moreRef}
        label={t('nav.more')}
        items={[
          { id: 'select', label: t('timeline.select'), icon: <SelectIcon size={21} />, disabled: entries.length === 0, onSelect: () => setSelecting(true) },
          { id: 'desc', label: t('timeline.newestFirst'), icon: <SortIcon size={21} />, checked: order === 'desc', onSelect: () => setOrder('desc') },
          { id: 'asc', label: t('timeline.oldestFirst'), icon: <SortIcon size={21} />, checked: order === 'asc', onSelect: () => setOrder('asc') },
          { id: 'folders', label: t('timeline.manageFolders'), icon: <FolderIcon size={21} />, onSelect: () => navigate('/settings#folders') },
          { id: 'settings', label: t('nav.settings'), icon: <GearIcon size={21} />, onSelect: () => navigate('/settings') },
        ]}
      />

      {selecting ? <BatchBar selected={selected} onDone={exitSelection} /> : null}

      {viewer ? (
        <Viewer
          items={viewer.items}
          all={viewer.entry.media}
          index={viewer.index}
          onIndex={(index) => setViewer({ ...viewer, index })}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </>
  )
}

/** One day: its numeral rides down the rail while its entries scroll past. */
function DayRow({
  group,
  today,
  language,
  zone,
  selecting,
  selected,
  onToggle,
  onOpenMedia,
}: {
  group: DayGroup
  today: string
  language: string
  zone: string
  selecting: boolean
  selected: number[]
  onToggle: (id: number) => void
  onOpenMedia: (entry: Entry, index: number) => void
}) {
  const { t } = useTranslation()
  const parts = dayParts(group.day, language)
  const isToday = group.day === today
  return (
    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-6">
      <Link
        to={`/archive?day=${group.day}`}
        className="sticky top-[calc(env(safe-area-inset-top)+64px)] flex flex-col items-center self-start pt-1 text-center"
        aria-label={longDate(group.day, language)}
      >
        <span
          className={cn(
            'tnum font-serif text-3xl leading-none font-medium [font-variation-settings:"opsz"_48]',
            isToday ? 'text-seal' : 'text-ink',
          )}
        >
          {parts.day}
        </span>
        <span className={cn('mt-1.5 text-xs leading-none', isToday ? 'font-medium text-seal' : 'text-ink-3')}>
          {isToday ? t('common.today') : parts.weekday}
        </span>
        {isToday ? <span aria-hidden="true" className="mt-1 size-1 rounded-full bg-seal" /> : null}
      </Link>
      <div className="flex flex-col gap-3">
        {group.entries.map((entry, index) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            index={index}
            language={language}
            zone={zone}
            selecting={selecting}
            selected={selected.includes(entry.id)}
            onToggle={onToggle}
            onOpenMedia={onOpenMedia}
          />
        ))}
      </div>
    </div>
  )
}

function TodayHero({ today, language }: { today: string; language: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const parts = dayParts(today, language)
  const year = today.slice(0, 4)

  return (
    <section className="pt-6 pb-8 sm:pt-8 sm:pb-10" aria-label={t('common.today')}>
      <div className="flex items-start gap-4">
        <span className="date-numeral text-ink">{parts.day}</span>
        <div className="flex items-end gap-3 pt-1">
          <div>
            <p className="title-3 text-ink">{parts.weekday}</p>
            <p className="caption tnum mt-0.5 text-ink-3">
              {year} · {parts.month}
            </p>
          </div>
          <Seal size={38} stamp label={t('common.today')}>
            今
          </Seal>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-rule pt-4">
        <p className="reading max-w-[18ch] text-balance text-ink-2">{t('timeline.todayPrompt')}</p>
        <Button tone="primary" icon={<PenIcon size={17} />} onClick={() => navigate('/write')}>
          {t('timeline.writeToday')}
        </Button>
      </div>
    </section>
  )
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      {[0, 1, 2].map((index) => (
        <div key={index} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-6">
          <div className="flex flex-col items-center gap-2 pt-1">
            <Skeleton className="h-7 w-7 rounded" />
            <Skeleton className="h-3 w-6 rounded" />
          </div>
          <div className="overflow-hidden rounded-xl bg-leaf">
            {index === 0 ? <Skeleton className="aspect-[4/3] rounded-none" /> : null}
            <div className="flex flex-col gap-2.5 p-4">
              <Skeleton className="h-5 w-2/3 rounded" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-4/5 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
