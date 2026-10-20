import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { localeFor } from '../../lib/format'
import { monthMatrix, partsOf } from './dates'
import { intensityClass, intensityOf } from './intensity'

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
 * A month as a grid of days, shaded by how much was written that day.
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
      <div className="grid grid-cols-7 gap-1 text-center text-[0.6875rem] font-medium tracking-wide text-ink-faint uppercase">
        {weekdays.map((label, index) => (
          <span key={`${label}-${index}`} className="py-1">
            {label}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const count = counts[cell.key] ?? 0
          const level = intensityOf(count, max)
          const isToday = cell.key === today
          const isSelected = cell.key === selected
          const day = partsOf(cell.key).day
          const label =
            count === 0
              ? `${cell.key}`
              : `${cell.key}, ${count === 1 ? t('calendar.oneEntry') : t('calendar.entriesOn', { count })}`

          const className = [
            'flex aspect-square w-full flex-col items-center justify-center rounded-md border text-sm transition-colors',
            intensityClass(level),
            cell.inMonth ? 'border-transparent' : 'border-line opacity-45',
            isToday ? 'font-semibold ring-1 ring-accent' : '',
            isSelected ? 'ring-2 ring-accent' : '',
          ]
            .filter(Boolean)
            .join(' ')

          if (!onSelect) {
            return (
              <div key={cell.key} className={className} title={label} aria-label={label}>
                <span>{day}</span>
                {count > 0 ? (
                  <span className="text-[0.625rem] leading-none opacity-80">{count}</span>
                ) : null}
              </div>
            )
          }

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelect(cell.key)}
              className={`${className} cursor-pointer hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
              title={label}
              aria-label={label}
              aria-current={isToday ? 'date' : undefined}
            >
              <span>{day}</span>
              {count > 0 ? (
                <span className="text-[0.625rem] leading-none opacity-80">{count}</span>
              ) : null}
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
