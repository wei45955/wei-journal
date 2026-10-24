import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { api } from '../../lib/api'
import { useResource } from '../../lib/cache'
import { cn } from '../../lib/cn'
import { addMonths, addYears, monthMatrix, partsOf } from '../../lib/dates'
import { displayTimezone, formatEventDate, formatNumber, localDateKey, localeFor, longDate, monthLabel } from '../../lib/format'
import type { CalendarResponse, Entry, Media, Stats } from '../../lib/types'
import { usePrefs } from '../../state/auth'
import { PageTitle, TopBar } from '../../shell/TopBar'
import { buttonClass, IconButton, Segmented, Skeleton } from '../../ui'
import { ArchiveIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, FileIcon, GearIcon, ImageIcon, PenIcon, SparkIcon, TextIcon, VideoIcon } from '../../ui/icons'
import { splitMedia, Thumb } from '../media/Thumb'
import { EntryCard } from '../timeline/EntryCard'

type View = 'month' | 'year'

export function ArchivePage() {
  const { t } = useTranslation()
  const { language, zone: zoneSetting } = usePrefs()
  const zone = displayTimezone(zoneSetting)
  const today = localDateKey(new Date(), zone)
  const [params, setParams] = useSearchParams()

  const view: View = params.get('view') === 'year' ? 'year' : 'month'
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(params.get('day') ?? '') ? (params.get('day') as string) : null
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get('at') ?? '') ? (params.get('at') as string) : (selected ?? today)

  function set(next: { view?: View; at?: string; day?: string | null }) {
    const merged = new URLSearchParams(params)
    if (next.view) merged.set('view', next.view)
    if (next.at) merged.set('at', next.at)
    if (next.day === null) merged.delete('day')
    else if (next.day) merged.set('day', next.day)
    setParams(merged, { replace: true })
  }

  const stats = useResource<Stats>(`stats:${zone}`, () => api.stats(zone))

  // The page keeps its state in the query string, so the path never changes
  // and the shell never restores the scroll. A new month, or a new view, is
  // a new page: it opens at its top.
  const period = `${view}:${anchor.slice(0, 7)}`
  const lastPeriod = useRef(period)
  useEffect(() => {
    if (lastPeriod.current === period) return
    lastPeriod.current = period
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [period])

  return (
    <>
      <TopBar
        title={t('archive.title')}
        trailing={
          <Link to="/settings" aria-label={t('nav.settings')} className="press flex size-11 items-center justify-center rounded-full text-ink lg:hidden">
            <GearIcon size={22} />
          </Link>
        }
      />
      <PageTitle sub={stats.data ? <Summary stats={stats.data} language={language} /> : <Skeleton className="h-5 w-48 rounded-md" />}>
        {t('archive.title')}
      </PageTitle>

      <section className="mt-2">
        <div className="mb-4 flex items-center gap-2">
          <Segmented
            label={t('archive.title')}
            value={view}
            onChange={(value) => set({ view: value })}
            options={[
              { value: 'month', label: t('archive.month') },
              { value: 'year', label: t('archive.year') },
            ]}
            className="w-[11rem]"
          />
          <div className="ml-auto flex items-center">
            <IconButton label={t('archive.previous')} onClick={() => set({ at: view === 'month' ? addMonths(anchor, -1) : addYears(anchor, -1) })}>
              <ChevronLeftIcon size={22} />
            </IconButton>
            <IconButton
              label={t('archive.next')}
              disabled={(view === 'month' ? anchor.slice(0, 7) : anchor.slice(0, 4)) >= (view === 'month' ? today.slice(0, 7) : today.slice(0, 4))}
              onClick={() => set({ at: view === 'month' ? addMonths(anchor, 1) : addYears(anchor, 1) })}
            >
              <ChevronRightIcon size={22} />
            </IconButton>
          </div>
        </div>

        {view === 'month' ? (
          <MonthView anchor={anchor} today={today} selected={selected} language={language} onSelect={(day) => set({ day: day === selected ? null : day })} />
        ) : (
          <YearView anchor={anchor} today={today} language={language} onMonth={(month) => set({ view: 'month', at: `${month}-01`, day: null })} />
        )}
      </section>

      {view === 'month' && selected ? <DayEntries day={selected} today={today} language={language} zone={zone} /> : null}

      <section className="mt-12">
        <h2 className="font-serif text-[1.375rem] text-ink [font-variation-settings:'opsz'_36]">{t('archive.stats')}</h2>
        {stats.data ? <Numbers stats={stats.data} language={language} /> : <Skeleton className="mt-4 h-48 w-full" />}
      </section>
    </>
  )
}

function Summary({ stats, language }: { stats: Stats; language: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-0.5">
      <span>
        {t('archive.entries', { count: stats.totalEntries })}
        {stats.firstEntryDate ? ` ${t('archive.since', { date: formatEventDate(stats.firstEntryDate, language, language === 'zh-CN' ? 'yyyy年M月' : 'MMMM yyyy') })}` : ''}
      </span>
      <span className={cn(stats.currentStreak > 0 ? 'text-accent' : 'text-ink-3')}>
        {stats.currentStreak > 0 ? t('archive.streak', { count: stats.currentStreak }) : t('archive.streakNone')}
      </span>
    </div>
  )
}

/* ----------------------------------------------------------------- month */

function MonthView({
  anchor,
  today,
  selected,
  language,
  onSelect,
}: {
  anchor: string
  today: string
  selected: string | null
  language: string
  onSelect: (day: string) => void
}) {
  const { t } = useTranslation()
  const month = anchor.slice(0, 7)
  const first = `${month}-01`
  const counts = useResource<CalendarResponse>(`calendar:month:${month}`, () => api.calendar('month', first))
  // The covers of the month: one request, so every written day can show a photo.
  const covers = useResource<Record<string, Media>>(`calendar:covers:${month}`, async () => {
    const page = await api.entries({ from: first, to: lastDayOf(first), limit: 100, order: 'asc' })
    const map: Record<string, Media> = {}
    for (const entry of page.items) {
      const day = entry.eventDate
      if (map[day]) continue
      const picture = splitMedia(entry.media ?? [], entry.coverMediaId).visual.find((item) => item.kind === 'image' || item.kind === 'live-still')
      if (picture) map[day] = picture
    }
    return map
  })

  const cells = useMemo(() => monthMatrix(first, language === 'zh-CN' ? 1 : 0), [first, language])
  const byDay = useMemo(() => new Map((counts.data?.days ?? []).map((day) => [day.date, day.count])), [counts.data])
  const locale = localeFor(language)
  const weekdays = cells.slice(0, 7).map((cell) => format(new Date(`${cell.key}T00:00:00`), language === 'zh-CN' ? 'EEEEE' : 'EEEEEE', { locale }))

  return (
    <div>
      <h3 className="mb-3 font-serif text-[1.5rem] text-ink [font-variation-settings:'opsz'_36]">{monthLabel(month, language)}</h3>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[0.75rem] text-ink-3" aria-hidden="true">
        {weekdays.map((label, index) => (
          <span key={index} className="pb-1">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label={monthLabel(month, language)}>
        {cells.map((cell) => {
          if (!cell.inMonth) return <span key={cell.key} aria-hidden="true" />
          const count = byDay.get(cell.key) ?? 0
          const cover = covers.data?.[cell.key]
          const future = cell.key > today
          const isToday = cell.key === today
          const isSelected = cell.key === selected
          const label = count
            ? t('archive.dayLabel', { date: longDate(cell.key, language), count })
            : longDate(cell.key, language)
          return (
            <button
              key={cell.key}
              type="button"
              disabled={future}
              aria-label={label}
              aria-pressed={isSelected}
              onClick={() => onSelect(cell.key)}
              className={cn(
                'press relative aspect-square overflow-hidden rounded-[10px] disabled:opacity-40',
                count ? (cover ? 'bg-well' : 'bg-accent-soft') : 'bg-transparent',
                isSelected && 'shadow-[0_0_0_2px_var(--wj-paper),0_0_0_4px_var(--wj-accent)]',
              )}
            >
              {cover ? <Thumb media={cover} className="absolute inset-0" /> : null}
              {cover ? <span className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-transparent" /> : null}
              <span
                className={cn(
                  'tnum absolute top-1 left-1.5 text-[0.8125rem] leading-tight font-medium',
                  cover ? 'text-white' : count ? 'text-accent' : 'text-ink-2',
                  isToday && !cover && 'text-accent underline decoration-2 underline-offset-4',
                  isToday && cover && 'underline decoration-2 underline-offset-4',
                )}
              >
                {partsOf(cell.key).day}
              </span>
              {count > 1 && !cover ? (
                <span className="absolute right-1.5 bottom-1.5 flex gap-[3px]" aria-hidden="true">
                  {Array.from({ length: Math.min(count, 3) }, (_, index) => (
                    <span key={index} className="size-[4px] rounded-full bg-accent" />
                  ))}
                </span>
              ) : count > 1 && cover ? (
                <span className="tnum absolute right-1 bottom-1 rounded-full bg-black/45 px-1.5 text-[0.625rem] leading-4 text-white">{count}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function lastDayOf(first: string) {
  const { year, month } = partsOf(first)
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return `${first.slice(0, 7)}-${String(days).padStart(2, '0')}`
}

/**
 * The days of a month, without the weeks that hold none of it. A calendar
 * always has six weeks, but a small month only needs five, and the empty
 * week at the end is only space.
 */
function weeksOf(cells: { key: string; inMonth: boolean }[]) {
  const weeks: { key: string; inMonth: boolean }[][] = []
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7))
  }
  while (weeks.length > 4 && weeks[weeks.length - 1].every((cell) => !cell.inMonth)) {
    weeks.pop()
  }
  return weeks.flat()
}

function DayEntries({ day, today, language, zone }: { day: string; today: string; language: string; zone: string }) {
  const { t } = useTranslation()
  const list = useResource<Entry[]>(`calendar:day:${day}`, async () => (await api.entries({ from: day, to: day, limit: 50, order: 'asc' })).items)
  return (
    <section className="mt-8 animate-rise" aria-live="polite">
      <h3 className="mb-3 text-[0.9375rem] font-semibold text-ink">{longDate(day, language)}</h3>
      {list.loading ? (
        <Skeleton className="h-28 w-full rounded-[20px]" />
      ) : (list.data ?? []).length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-[20px] bg-leaf px-5 py-5">
          <p className="font-serif text-[1rem] text-ink-2">{t('archive.dayEmpty')}</p>
          {day <= today ? (
            <Link to={`/write?day=${day}`} className={buttonClass('primary', 'sm')}>
              <PenIcon size={16} />
              {t('archive.writeForDay')}
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {(list.data ?? []).map((entry) => (
            <EntryCard key={entry.id} entry={entry} language={language} zone={zone} />
          ))}
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ year */

function YearView({
  anchor,
  today,
  language,
  onMonth,
}: {
  anchor: string
  today: string
  language: string
  onMonth: (month: string) => void
}) {
  const { t } = useTranslation()
  const year = anchor.slice(0, 4)
  const counts = useResource<CalendarResponse>(`calendar:year:${year}`, () => api.calendar('year', `${year}-01-01`))
  const byDay = useMemo(() => new Map((counts.data?.days ?? []).map((day) => [day.date, day.count])), [counts.data])
  const peak = Math.max(1, ...byDay.values())
  const weekStart = language === 'zh-CN' ? 1 : 0

  const level = (count: number) => (count === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((count / peak) * 4))))
  const shade = ['bg-well', 'bg-accent/30', 'bg-accent/55', 'bg-accent/80', 'bg-accent']

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="tnum font-serif text-[1.5rem] text-ink [font-variation-settings:'opsz'_36]">{year}</h3>
        <span className="text-[0.875rem] text-ink-2">
          {counts.data ? t('archive.yearTotal', { count: counts.data.total, year }) : null}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-x-3 gap-y-4 sm:grid-cols-6 sm:gap-x-4">
        {Array.from({ length: 12 }, (_, index) => {
          const month = `${year}-${String(index + 1).padStart(2, '0')}`
          const cells = monthMatrix(`${month}-01`, weekStart)
          const written = cells.filter((cell) => cell.inMonth && (byDay.get(cell.key) ?? 0) > 0).length
          const future = month > today.slice(0, 7)
          return (
            <button
              key={month}
              type="button"
              disabled={future}
              onClick={() => onMonth(month)}
              className="press rounded-[10px] text-left disabled:opacity-35"
              aria-label={`${monthLabel(month, language)}, ${written}`}
            >
              <span className="mb-1 flex items-baseline justify-between gap-1 text-[0.6875rem]">
                <span className={cn('truncate', month === today.slice(0, 7) ? 'font-semibold text-accent' : 'text-ink')}>
                  {format(new Date(`${month}-01T00:00:00`), language === 'zh-CN' ? 'M月' : 'MMM', { locale: localeFor(language) })}
                </span>
                {written ? <span className="tnum shrink-0 text-[0.625rem] text-ink-3">{written}</span> : null}
              </span>
              <span className="grid grid-cols-7 gap-[2px]" aria-hidden="true">
                {weeksOf(cells).map((cell) => (
                  <span
                    key={cell.key}
                    className={cn(
                      'aspect-square rounded-[1.5px]',
                      cell.inMonth ? shade[level(byDay.get(cell.key) ?? 0)] : 'bg-transparent',
                      cell.key === today && 'ring-1 ring-ink',
                    )}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-5 flex items-center justify-end gap-1.5 text-[0.75rem] text-ink-3">
        <span>{t('archive.fewer')}</span>
        {shade.map((value) => (
          <span key={value} className={cn('size-2.5 rounded-[2px]', value)} />
        ))}
        <span>{t('archive.more')}</span>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- numbers */

function Numbers({ stats, language }: { stats: Stats; language: string }) {
  const { t } = useTranslation()

  // The three that carry the journal, then what it holds, then the year.
  const main: Array<{ key: string; label: string; value: number; icon: ReactNode }> = [
    { key: 'entries', label: t('archive.statEntries'), value: stats.totalEntries, icon: <PenIcon size={15} /> },
    { key: 'days', label: t('archive.statDays'), value: stats.activeDays, icon: <ClockIcon size={15} /> },
    { key: 'words', label: t('archive.statWords'), value: stats.totalWords, icon: <TextIcon size={15} /> },
  ]
  const media: Array<{ key: string; label: string; value: number; icon: ReactNode }> = [
    { key: 'photos', label: t('archive.statPhotos'), value: stats.totalPhotos, icon: <ImageIcon size={15} /> },
    { key: 'videos', label: t('archive.statVideos'), value: stats.totalVideos, icon: <VideoIcon size={15} /> },
    { key: 'files', label: t('archive.statFiles'), value: stats.totalFiles + (stats.totalAudios ?? 0), icon: <FileIcon size={15} /> },
  ]

  return (
    <div className="mt-4 overflow-hidden rounded-[20px] bg-leaf">
      <dl className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
        {main.map((cell) => (
          <div key={cell.key} className="px-3 py-3.5">
            <dt className="flex items-center gap-1.5 text-[0.75rem] leading-tight text-ink-2">
              <span className="shrink-0 text-ink-3">{cell.icon}</span>
              <span className="truncate">{cell.label}</span>
            </dt>
            <dd className="tnum mt-1 font-serif text-[1.5rem] leading-none text-ink [font-variation-settings:'opsz'_40]">
              {formatNumber(cell.value, language)}
            </dd>
          </div>
        ))}
      </dl>

      <dl className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
        {media.map((cell) => (
          <div key={cell.key} className="px-3 py-3">
            <dt className="flex items-center gap-1.5 text-[0.75rem] leading-tight text-ink-2">
              <span className="shrink-0 text-ink-3">{cell.icon}</span>
              <span className="truncate">{cell.label}</span>
            </dt>
            <dd className="tnum mt-0.5 font-serif text-[1.125rem] leading-none text-ink-2 [font-variation-settings:'opsz'_30]">
              {formatNumber(cell.value, language)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center justify-between gap-4 px-3 py-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-ink-2">
          <SparkIcon size={15} className="shrink-0 text-ink-3" />
          <span className="truncate">
            {t('archive.statYear')} {stats.currentYear}
          </span>
        </span>
        <span className="tnum shrink-0 font-serif text-[1.125rem] leading-none text-ink [font-variation-settings:'opsz'_30]">
          {formatNumber(stats.entriesThisYear, language)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-rule px-3 py-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[0.8125rem] text-ink-2">
          <ArchiveIcon size={15} className="shrink-0 text-ink-3" />
          <span className="truncate">{t('archive.longest', { count: stats.longestStreak })}</span>
        </span>
        {/* The run of days, drawn as the chain it is. */}
        <span className="flex shrink-0 items-center gap-[3px]" aria-hidden="true">
          {Array.from({ length: Math.min(stats.longestStreak, 12) }, (_, index) => (
            <span key={index} className="size-[5px] rounded-full bg-accent" />
          ))}
          {stats.longestStreak > 12 ? <span className="tnum pl-1 text-[0.6875rem] text-ink-3">+{stats.longestStreak - 12}</span> : null}
        </span>
      </div>
    </div>
  )
}
