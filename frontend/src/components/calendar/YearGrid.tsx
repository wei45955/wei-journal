import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { localeFor } from '../../lib/format'
import { monthOf, yearMatrix } from './dates'
import { intensityClass, intensityOf } from './intensity'

interface YearGridProps {
  year: number
  /** Entries per day, keyed by `YYYY-MM-DD`. */
  counts: Record<string, number>
  language: string
  today: string
  selected?: string
  onSelect?: (key: string) => void
}

/**
 * A whole year as a heat map: one column per week, one row per weekday.
 */
export function YearGrid({ year, counts, language, today, selected, onSelect }: YearGridProps) {
  const { t } = useTranslation()
  const locale = localeFor(language)
  const weeks = useMemo(() => yearMatrix(year), [year])

  const max = useMemo(
    () =>
      weeks.reduce(
        (highest, week) =>
          week.reduce((inner, day) => Math.max(inner, counts[day.key] ?? 0), highest),
        0,
      ),
    [weeks, counts],
  )

  const labels = useMemo(() => {
    const found: { index: number; text: string }[] = []
    weeks.forEach((week, index) => {
      const previous = index === 0 ? null : weeks[index - 1]
      const change = previous
        ? week.find((day) => monthOf(day.key) !== monthOf(previous[0].key))
        : week[0]
      if (!change) return
      const date = new Date(`${change.key}T00:00:00`)
      found.push({ index, text: format(date, 'MMM', { locale }) })
    })
    return found
  }, [weeks, locale])

  const weekdayLabels = useMemo(() => {
    const first = weeks[0][0].key
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${first}T00:00:00`)
      date.setDate(date.getDate() + index)
      return format(date, 'EEE', { locale })
    })
  }, [weeks, locale])

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex w-max gap-2">
        <div className="flex shrink-0 flex-col gap-1 pt-4">
          {weekdayLabels.map((label, index) => (
            <span key={label} className="h-3 text-[0.625rem] leading-3 text-ink-faint">
              {index % 2 === 1 ? label : ''}
            </span>
          ))}
        </div>

        <div>
          <div className="relative h-4">
            {labels.map((label) => (
              <span
                key={`${label.index}-${label.text}`}
                className="absolute top-0 text-[0.625rem] leading-4 whitespace-nowrap text-ink-faint"
                style={{ left: `calc(${label.index} * 1rem)` }}
              >
                {label.text}
              </span>
            ))}
          </div>

          <div className="flex gap-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((day) => {
                  const count = counts[day.key] ?? 0
                  const level = intensityOf(count, max)
                  const isToday = day.key === today
                  const isSelected = day.key === selected
                  const label =
                    count === 0
                      ? day.key
                      : `${day.key}, ${
                          count === 1 ? t('calendar.oneEntry') : t('calendar.entriesOn', { count })
                        }`
                  const className = [
                    'h-3 w-3 rounded-[3px] border border-transparent',
                    intensityClass(level),
                    day.inYear ? '' : 'opacity-30',
                    isToday ? 'ring-1 ring-accent' : '',
                    isSelected ? 'ring-2 ring-accent' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  if (!onSelect) {
                    return <div key={day.key} className={className} title={label} aria-label={label} />
                  }
                  return (
                    <button
                      key={day.key}
                      type="button"
                      onClick={() => onSelect(day.key)}
                      className={`${className} cursor-pointer hover:ring-2 hover:ring-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
                      title={label}
                      aria-label={label}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
