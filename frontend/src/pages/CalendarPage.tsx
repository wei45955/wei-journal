import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { api } from '../lib/api'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons'
import { formatTime, localeFor, localDateKey } from '../lib/format'
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
export function CalendarPage() {
  const { t, i18n } = useTranslation()
  const { describe } = useToast()
  const { user } = useAuth()

  const language = user?.settings.language ?? i18n.resolvedLanguage ?? 'en'
  const timezone = user?.settings.timezone || undefined
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
    if (view === 'day') return format(date, 'PPPP', { locale })
    if (view === 'month') return format(date, 'MMMM yyyy', { locale })
    return String(yearOf(anchor))
  }, [anchor, view, locale])

  const dayCount = counts[anchor] ?? 0
  const isToday = anchor === today

  return (
    <div className="pb-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-ink-strong">{t('calendar.title')}</h1>
          <p className="mt-0.5 text-sm text-ink-muted">{title}</p>
        </div>

        <div
          className="flex rounded-lg border border-line bg-paper-raised p-0.5"
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
              className={`cursor-pointer rounded-md px-3 py-1.5 text-sm transition-colors ${
                view === option.value
                  ? 'bg-accent text-accent-contrast'
                  : 'text-ink-muted hover:text-ink-strong'
              }`}
            >
              {t(option.key, option.fallback)}
            </button>
          ))}
        </div>
      </header>

      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => shift(-1)}
            aria-label={t('calendar.previous')}
            title={t('calendar.previous')}
          >
            <ChevronLeftIcon size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => shift(1)}
            aria-label={t('calendar.next')}
            title={t('calendar.next')}
          >
            <ChevronRightIcon size={16} />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {view === 'month' || view === 'year' ? (
            <span className="text-xs text-ink-muted">
              {t('calendar.totalEntries', '{{count}} entries', { count: total })}
            </span>
          ) : null}
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

      {status === 'loading' ? (
        <Skeleton className="h-72 w-full" />
      ) : status === 'error' ? (
        <ErrorState message={error} onRetry={() => setReloadToken((token) => token + 1)} />
      ) : view === 'month' ? (
        <div className="rounded-lg border border-line bg-paper-raised p-3 sm:p-4">
          <MonthGrid
            month={anchor}
            counts={counts}
            language={language}
            today={today}
            selected={anchor}
            onSelect={selectDay}
          />
          <div className="mt-3 flex justify-end">
            <CalendarLegend />
          </div>
        </div>
      ) : view === 'year' ? (
        <div className="rounded-lg border border-line bg-paper-raised p-3 sm:p-4">
          <YearGrid
            year={partsOf(anchor).year}
            counts={counts}
            language={language}
            today={today}
            selected={anchor}
            onSelect={selectDay}
          />
          <div className="mt-3 flex justify-end">
            <CalendarLegend />
          </div>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-sm text-ink-muted">
            {dayCount === 0
              ? t('calendar.noEntries')
              : dayCount === 1
                ? t('calendar.oneEntry')
                : t('calendar.entriesOn', { count: dayCount })}
          </p>

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
            <ul className="flex flex-col gap-2">
              {entries.map((entry) => {
                const title = entry.title.trim() || t('entries.untitled')
                const snippet = entry.plainText.trim().replace(/\s+/g, ' ').slice(0, 160)
                return (
                  <li key={entry.id}>
                    <Link
                      to={`/entries/${entry.id}`}
                      className="block rounded-lg border border-line bg-paper-raised p-3 transition-colors hover:border-line-strong"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-[--font-sans] text-[0.9375rem] font-medium text-ink-strong">
                          {title}
                        </span>
                        <span className="shrink-0 text-xs text-ink-faint">
                          {formatTime(entry.eventTime, language)}
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
