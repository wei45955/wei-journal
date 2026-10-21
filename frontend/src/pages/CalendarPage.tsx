import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { api } from '../lib/api'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons'
import {
  displayTimezone,
  formatEventDate,
  formatTime,
  localeFor,
  localDateKey,
  normalizeDateFormat,
} from '../lib/format'
import type { Entry } from '../lib/types'
import { MonthGrid } from '../components/calendar/MonthGrid'
import { YearGrid } from '../components/calendar/YearGrid'
import { CalendarLegend } from '../components/calendar/CalendarLegend'
import { addDays, addMonths, addYears, partsOf, yearOf } from '../components/calendar/dates'

type View = 'day' | 'month' | 'year'

const VIEWS: { value: View; key: string; fallback: string }[] = [
  { value: 'day', key: 'calendar.day', fallback: 'Day' },
  { value: 'month', key: 'calendar.month', fallback: 'Month' },
  { value: 'year', key: 'calendar.year', fallback: 'Year' },
]

/**
 * The calendar: a day, a month or a year of writing, shaded by how much was
 * written and linked to the entries themselves.
 */
export function CalendarPage({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation()
  const { describe } = useToast()
  const { user } = useAuth()

  const language = user?.settings.language ?? i18n.resolvedLanguage ?? 'en'
  const timezone = displayTimezone(user?.settings.timezone)
  const locale = localeFor(language)

  const [view, setView] = useState<View>('month')
  const [anchor, setAnchor] = useState(() => localDateKey(new Date(), timezone))
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [reloadToken, setReloadToken] = useState(0)

  const [entries, setEntries] = useState<Entry[]>([])
  const [dayStatus, setDayStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [dayError, setDayError] = useState('')

  const today = useMemo(() => localDateKey(new Date(), timezone), [timezone])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    void (async () => {
      try {
        const data = await api.calendar(view, anchor)
        if (cancelled) return
        const map: Record<string, number> = {}
        for (const day of data.days) map[day.date] = day.count
        setCounts(map)
        setTotal(data.total)
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
  }, [view, anchor, reloadToken, describe, t])

  useEffect(() => {
    if (view !== 'day') return
    let cancelled = false
    setDayStatus('loading')
    void (async () => {
      try {
        const page = await api.entries({ from: anchor, to: anchor, limit: 50, order: 'asc' })
        if (cancelled) return
        setEntries(page.items)
        setDayError('')
        setDayStatus('ready')
      } catch (err) {
        if (cancelled) return
        setDayError(describe(err, t('errors.generic')))
        setDayStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [view, anchor, reloadToken, describe, t])

  function shift(direction: number) {
    setAnchor((current) => {
      if (view === 'day') return addDays(current, direction)
      if (view === 'month') return addMonths(current, direction)
      return addYears(current, direction)
    })
  }

  function selectDay(key: string) {
    setAnchor(key)
    setView('day')
  }

  const title = useMemo(() => {
    const date = new Date(`${anchor}T00:00:00`)
    if (view === 'day') {
      return formatEventDate(anchor, language, normalizeDateFormat(user?.settings.dateFormat))
    }
    if (view === 'month') {
      return format(date, language === 'zh-CN' ? 'yyyy年M月' : 'MMMM yyyy', { locale })
    }
    return String(yearOf(anchor))
  }, [anchor, view, locale, language, user?.settings.dateFormat])

  const dayCount = counts[anchor] ?? 0
  const isToday = anchor === today

  return (
    <div className="pb-8">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          {embedded ? (
            <h2 className="title-section text-ink-muted">{t('calendar.title')}</h2>
          ) : (
            <h1 className="title-large text-ink-strong">{t('calendar.title')}</h1>
          )}
          {/* The month and year cards carry the date in their own header. */}
          {view === 'day' ? <p className="mt-1 text-sm text-ink-muted">{title}</p> : null}
        </div>

        <div
          className="flex rounded-xl bg-paper-sunken p-1"
          role="tablist"
          aria-label={t('calendar.title')}
        >
          {VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={view === option.value}
              onClick={() => setView(option.value)}
              className={`min-h-10 cursor-pointer rounded-[0.625rem] px-4 py-1.5 text-sm font-semibold transition-all duration-200 ${
                view === option.value
                  ? 'bg-paper-raised text-ink-strong shadow-[0_1px_3px_rgb(0_0_0/0.08)]'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {t(option.key, option.fallback)}
            </button>
          ))}
        </div>
      </header>

      {status === 'loading' ? (
        <Skeleton className="h-72 w-full" />
      ) : status === 'error' ? (
        <ErrorState message={error} onRetry={() => setReloadToken((token) => token + 1)} />
      ) : view === 'month' ? (
        <div className="card p-4 sm:p-5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-[1.375rem] font-bold tracking-tight text-ink-strong">{title}</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shift(-1)}
                aria-label={t('calendar.previous')}
                title={t('calendar.previous')}
                className="text-accent"
              >
                <ChevronLeftIcon size={20} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shift(1)}
                aria-label={t('calendar.next')}
                title={t('calendar.next')}
                className="text-accent"
              >
                <ChevronRightIcon size={20} />
              </Button>
            </div>
          </div>

          <MonthGrid
            month={anchor}
            counts={counts}
            language={language}
            today={today}
            selected={anchor}
            onSelect={selectDay}
          />

          <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
            <span className="text-xs text-ink-muted">
              {t('calendar.totalEntries', '{{count}} entries', { count: total })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAnchor(today)}
              disabled={isToday}
            >
              {t('common.today')}
            </Button>
          </div>
        </div>
      ) : view === 'year' ? (
        <div className="card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[1.375rem] font-bold tracking-tight text-ink-strong">{title}</h2>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shift(-1)}
                aria-label={t('calendar.previous')}
                title={t('calendar.previous')}
                className="text-accent"
              >
                <ChevronLeftIcon size={20} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shift(1)}
                aria-label={t('calendar.next')}
                title={t('calendar.next')}
                className="text-accent"
              >
                <ChevronRightIcon size={20} />
              </Button>
            </div>
          </div>

          <YearGrid
            year={partsOf(anchor).year}
            counts={counts}
            language={language}
            today={today}
            selected={anchor}
            onSelect={selectDay}
          />

          <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
            <span className="text-xs text-ink-muted">
              {t('calendar.totalEntries', '{{count}} entries', { count: total })}
            </span>
            <CalendarLegend />
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              {dayCount === 0
                ? t('calendar.noEntries')
                : dayCount === 1
                  ? t('calendar.oneEntry')
                  : t('calendar.entriesOn', { count: dayCount })}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shift(-1)}
                aria-label={t('calendar.previous')}
                title={t('calendar.previous')}
                className="text-accent"
              >
                <ChevronLeftIcon size={20} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => shift(1)}
                aria-label={t('calendar.next')}
                title={t('calendar.next')}
                className="text-accent"
              >
                <ChevronRightIcon size={20} />
              </Button>
            </div>
          </div>

          {dayStatus === 'loading' ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : dayStatus === 'error' ? (
            <ErrorState message={dayError} onRetry={() => setReloadToken((token) => token + 1)} />
          ) : entries.length === 0 ? (
            <EmptyState title={t('calendar.noEntries')} body={t('entries.empty.body')} />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {entries.map((entry) => {
                const title = entry.title.trim() || t('entries.untitled')
                const snippet = entry.plainText.trim().replace(/\s+/g, ' ').slice(0, 160)
                return (
                  <li key={entry.id}>
                    <Link
                      to={`/entries/${entry.id}`}
                      className="block rounded-2xl bg-paper-raised p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_2px_10px_rgb(0_0_0/0.07)]"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[1.0625rem] font-semibold text-ink-strong">{title}</span>
                        <span className="shrink-0 text-xs text-ink-faint tabular-nums">
                          {formatTime(entry.eventTime, language, timezone)}
                        </span>
                      </div>
                      {snippet ? (
                        <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{snippet}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-ink-faint">
                        {entry.folderName || t('entries.noFolder')}
                        {entry.tags.length > 0 ? ` · ${entry.tags.map((tag) => tag.name).join(', ')}` : ''}
                      </p>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default CalendarPage
