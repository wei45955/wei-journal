import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { ErrorState, Skeleton } from '../components/ui'
import { CoffeeIcon } from '../components/icons'
import { partsOf } from '../components/calendar/dates'
import { displayTimezone, localDateKey } from '../lib/format'
import type { Stats } from '../lib/types'
import { CalendarPage } from './CalendarPage'
import { MapPage } from './MapPage'

interface MonthCount {
  /** `YYYY-MM`. */
  key: string
  count: number
}

const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

/**
 * The insights of the archive: how much was written, where it was written
 * from and how the days of the year were spent.
 */
export function InsightsPage() {
  const { t } = useTranslation()
  const { describe } = useToast()
  const { user } = useAuth()

  const [stats, setStats] = useState<Stats | null>(null)
  const [months, setMonths] = useState<MonthCount[]>([])
  const [placeCount, setPlaceCount] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  const today = useMemo(
    () => localDateKey(new Date(), displayTimezone(user?.settings.timezone)),
    [user?.settings.timezone],
  )

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    void (async () => {
      try {
        const { year } = partsOf(today)
        const [summary, places, calendar] = await Promise.all([
          api.stats(),
          api.locations(),
          api.calendar('year', `${year}-01-01`),
        ])
        if (cancelled) return

        // The twelve months of the year in view, January first.
        const buckets = new Map<string, number>()
        for (const day of calendar.days) {
          const key = day.date.slice(0, 7)
          buckets.set(key, (buckets.get(key) ?? 0) + day.count)
        }
        const series: MonthCount[] = []
        for (let month = 1; month <= 12; month += 1) {
          const key = `${year}-${String(month).padStart(2, '0')}`
          series.push({ key, count: buckets.get(key) ?? 0 })
        }

        setStats(summary)
        setMonths(series)
        setPlaceCount(places.items.length)
        setError('')
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setError(describe(err, t('errors.generic')))
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [today, reloadToken, describe, t])

  const yearTotal = months.reduce((sum, month) => sum + month.count, 0)
  const peak = Math.max(1, ...months.map((month) => month.count))

  return (
    <div className="pb-8">
      <header className="mb-4">
        <h1 className="title-large text-ink-strong">{t('stats.title')}</h1>
      </header>

      {status === 'loading' ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-44 w-full" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      ) : status === 'error' ? (
        <ErrorState message={error} onRetry={() => setReloadToken((token) => token + 1)} />
      ) : (
        <>
          {/* --- the year at a glance --- */}
          <section
            className="stat-tile p-5"
            style={{ background: 'var(--grad-violet)' }}
            aria-label={t('stats.thisYear')}
          >
            <div className="flex items-start gap-4">
              <div className="shrink-0">
                <p className="font-display text-[3.25rem] leading-none font-bold tracking-tight">
                  {yearTotal}
                </p>
                <p className="mt-1 text-[1.0625rem] font-semibold">{t('stats.totalEntries')}</p>
                <p className="text-[0.9375rem] text-white/70">{t('stats.thisYear')}</p>
              </div>

              <div className="min-w-0 flex-1">
                <MiniChart months={months} peak={peak} />
              </div>
            </div>
          </section>

          {/* --- three numbers --- */}
          <section className="mt-3 grid grid-cols-3 gap-3">
            <StatTile
              gradient="var(--grad-rose)"
              label={t('stats.journaled')}
              value={stats?.activeDays ?? 0}
              unit={stats?.activeDays === 1 ? t('stats.oneDay') : t('stats.days')}
            />
            <StatTile
              gradient="var(--grad-slate)"
              label={t('stats.visited')}
              value={placeCount}
              unit={placeCount === 1 ? t('stats.oneTime') : t('stats.times')}
              icon={<CoffeeIcon size={22} />}
            />
            <StatTile
              gradient="var(--grad-sun)"
              label={t('stats.written')}
              value={stats?.totalWords ?? 0}
              unit={t('stats.wordsUnit')}
            />
          </section>

          <section className="mt-7">
            <CalendarPage embedded />
          </section>

          {/* --- the rest of the numbers --- */}
          <section className="mt-7">
            <h2 className="mb-2.5 px-1 title-section text-ink-muted">{t('stats.details')}</h2>
            <dl className="card divide-y divide-line overflow-hidden">
              <StatRow label={t('stats.totalEntries')} value={stats?.totalEntries ?? 0} />
              <StatRow label={t('stats.totalWords')} value={stats?.totalWords ?? 0} />
              <StatRow label={t('stats.totalPhotos')} value={stats?.totalPhotos ?? 0} />
              <StatRow label={t('stats.totalVideos')} value={stats?.totalVideos ?? 0} />
              <StatRow label={t('stats.totalFiles')} value={stats?.totalFiles ?? 0} />
              <StatRow
                label={t('stats.currentStreak')}
                value={`${stats?.currentStreak ?? 0} ${
                  stats?.currentStreak === 1 ? t('stats.oneDay') : t('stats.days')
                }`}
              />
              <StatRow
                label={t('stats.longestStreak')}
                value={`${stats?.longestStreak ?? 0} ${
                  stats?.longestStreak === 1 ? t('stats.oneDay') : t('stats.days')
                }`}
              />
              <StatRow
                label={t('stats.firstEntry')}
                value={stats?.firstEntryDate || t('stats.never')}
              />
              <StatRow
                label={t('stats.lastEntry')}
                value={stats?.lastEntryDate || t('stats.never')}
              />
            </dl>
          </section>

          <section className="mt-7">
            <MapPage embedded />
          </section>
        </>
      )}
    </div>
  )
}

/** A row of twelve needles, one for each month of the year. */
function MiniChart({ months, peak }: { months: MonthCount[]; peak: number }) {
  // The scale is rounded up to a multiple of ten, so the labels on the
  // right are always round numbers.
  const top = Math.max(10, Math.ceil(peak / 10) * 10)
  const gridValues = [top, top / 2]

  return (
    <div className="flex h-24 flex-col justify-end">
      <div className="relative flex-1 pr-6">
        {gridValues.map((value) => (
          <span
            key={value}
            className="absolute inset-x-0 border-t border-white/25"
            style={{ bottom: `${(value / top) * 100}%` }}
            aria-hidden="true"
          />
        ))}
        {[...gridValues, 0].map((value) => (
          <span
            key={value}
            className="absolute right-0 text-[0.5625rem] leading-[0.8rem] font-semibold text-white/60 tabular-nums"
            style={{ bottom: `calc(${(value / top) * 100}% - 0.4rem)` }}
            aria-hidden="true"
          >
            {value}
          </span>
        ))}

        {/* One needle per month, growing up from the baseline. */}
        <div className="absolute inset-y-0 left-0 right-6 flex items-end">
          {months.map((month) => (
            <span key={month.key} className="flex h-full flex-1 items-end justify-center">
              {month.count > 0 ? (
                <span
                  className="w-[2px] rounded-full bg-white/90"
                  style={{ height: `${Math.max(8, (month.count / top) * 100)}%` }}
                  title={`${month.key}: ${month.count}`}
                />
              ) : (
                <span
                  className="size-[3px] rounded-full bg-white/45"
                  title={`${month.key}: 0`}
                />
              )}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-1 flex pr-6 text-[0.625rem] font-semibold text-white/70">
        {MONTH_LETTERS.map((letter, index) => (
          <span key={`${letter}-${index}`} className="flex-1 text-center">
            {letter}
          </span>
        ))}
      </div>
    </div>
  )
}

/** One of the three colourful tiles below the big card. */
function StatTile({
  gradient,
  label,
  value,
  unit,
  icon,
}: {
  gradient: string
  label: string
  value: number
  unit: string
  icon?: ReactNode
}) {
  return (
    <div className="stat-tile p-3.5" style={{ background: gradient }}>
      <p className="truncate text-center text-[0.8125rem] font-semibold text-white/90">{label}</p>
      {icon ? <div className="mt-1 flex justify-center">{icon}</div> : null}
      <p className="mt-1 text-center font-display text-[2rem] leading-none font-bold tracking-tight">
        {value}
      </p>
      <p className="mt-1 truncate text-center text-[0.75rem] font-medium text-white/75">{unit}</p>
    </div>
  )
}

/** One line of the details list. */
function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-[0.9375rem] text-ink-muted">{label}</dt>
      <dd className="text-[0.9375rem] font-semibold text-ink-strong tabular-nums">{value}</dd>
    </div>
  )
}

export default InsightsPage
