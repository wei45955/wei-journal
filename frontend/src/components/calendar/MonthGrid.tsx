import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { cn } from '../../lib/cn'
import { localeFor } from '../../lib/format'
import { monthMatrix, partsOf } from './dates'
import { intensityOf } from './intensity'

interface MonthGridProps {
  /** Any day inside the month that is shown. */
  month: string
  /** Entries per day, keyed by `YYYY-MM-DD`. */
  counts: Record<string, number>
  language: string
  today: string
  selected?: string
  onSelect?: (key: string) => void
}

/**
 * A month as a grid of days, with a dot under every day that was written on.
 */
export function MonthGrid({ month, counts, language, today, selected, onSelect }: MonthGridProps) {
  const { t } = useTranslation()
  const locale = localeFor(language)
  const cells = useMemo(() => monthMatrix(month), [month])
  const max = useMemo(
    () => cells.reduce((highest, cell) => Math.max(highest, counts[cell.key] ?? 0), 0),
    [cells, counts],
  )
  const { year } = partsOf(month)

  const weekdays = useMemo(
    () =>
      cells.slice(0, 7).map((cell) => {
        const date = new Date(`${cell.key}T00:00:00`)
        return format(date, 'EEE', { locale })
      }),
    [cells, locale],
  )

  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[0.6875rem] font-semibold tracking-wide text-ink-faint uppercase">
        {weekdays.map((label, index) => (
          <span key={`${label}-${index}`} className="py-2">
            {label}
          </span>
        ))}
      </div>

      <div className="mt-0.5 grid grid-cols-7">
        {cells.map((cell) => {
          const count = counts[cell.key] ?? 0
          const level = intensityOf(count, max)
          const isToday = cell.key === today
          const isSelected = cell.key === selected
          const isFuture = cell.key > today
          const day = partsOf(cell.key).day
          const label =
            count === 0
              ? `${cell.key}`
              : `${cell.key}, ${count === 1 ? t('calendar.oneEntry') : t('calendar.entriesOn', { count })}`

          // Only one colour reaches the day: two of them would settle it by
          // the order of the stylesheet, not by the order written here.
          const numberClass = cn(
            'mx-auto flex size-9 items-center justify-center rounded-full text-[1.0625rem] leading-none transition-colors',
            isToday
              ? 'bg-accent-soft font-semibold text-accent'
              : isSelected
                ? 'bg-paper-sunken font-semibold text-ink-strong'
                : !cell.inMonth || isFuture
                  ? 'text-ink-faint/50'
                  : 'text-ink-strong',
          )

          const body = (
            <>
              <span className={numberClass}>{day}</span>
              {count > 0 && cell.inMonth ? (
                <span
                  className={cn(
                    'mt-1 size-1.5 rounded-full',
                    level >= 4 ? 'bg-accent' : level >= 2 ? 'bg-accent/70' : 'bg-accent/45',
                  )}
                  aria-hidden="true"
                />
              ) : (
                <span className="mt-1 size-1.5" aria-hidden="true" />
              )}
            </>
          )

          if (!onSelect) {
            return (
              <div key={cell.key} className="py-1 text-center" title={label} aria-label={label}>
                {body}
              </div>
            )
          }

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelect(cell.key)}
              className="cursor-pointer py-1 text-center transition-transform active:scale-90"
              title={label}
              aria-label={label}
              aria-current={isToday ? 'date' : undefined}
            >
              {body}
            </button>
          )
        })}
      </div>

      <p className="sr-only">
        {t('calendar.activity')} {year}
      </p>
    </div>
  )
}
