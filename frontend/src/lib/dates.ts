/**
 * Day arithmetic for the calendar.
 *
 * A day is a plain `YYYY-MM-DD` string because that is exactly how the server
 * groups entries (`event_date`). Every calculation here happens in UTC so the
 * browser's timezone can never move an entry to a neighbouring day.
 */

const MS_PER_DAY = 86_400_000

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

/** Splits a key into its parts. The month is zero based, like `Date`. */
export function partsOf(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number)
  return { year, month: month - 1, day }
}

export function toTime(key: string): number {
  const { year, month, day } = partsOf(key)
  return Date.UTC(year, month, day)
}

export function fromTime(time: number): string {
  const date = new Date(time)
  return dateKey(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function addDays(key: string, days: number): string {
  return fromTime(toTime(key) + days * MS_PER_DAY)
}

export function addMonths(key: string, months: number): string {
  const { year, month, day } = partsOf(key)
  const total = year * 12 + month + months
  const nextYear = Math.floor(total / 12)
  const nextMonth = total - nextYear * 12
  const lastDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate()
  return dateKey(nextYear, nextMonth, Math.min(day, lastDay))
}

export function addYears(key: string, years: number): string {
  return addMonths(key, years * 12)
}

export function startOfMonth(key: string): string {
  const { year, month } = partsOf(key)
  return dateKey(year, month, 1)
}

export function endOfMonth(key: string): string {
  const { year, month } = partsOf(key)
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return dateKey(year, month, lastDay)
}

export function startOfYear(key: string): string {
  return `${partsOf(key).year}-01-01`
}

export function endOfYear(key: string): string {
  return `${partsOf(key).year}-12-31`
}

export function yearOf(key: string): number {
  return partsOf(key).year
}

/** The day of the week, 0 for Sunday. */
export function weekdayOf(key: string): number {
  return new Date(toTime(key)).getUTCDay()
}

export function monthOf(key: string): string {
  return key.slice(0, 7)
}

/** The six weeks that cover a month, with the days of the neighbouring months. */
export function monthMatrix(key: string, weekStartsOn = 0): { key: string; inMonth: boolean }[] {
  const first = startOfMonth(key)
  const lead = (weekdayOf(first) - weekStartsOn + 7) % 7
  const start = addDays(first, -lead)
  const cells: { key: string; inMonth: boolean }[] = []
  for (let index = 0; index < 42; index += 1) {
    const cellKey = addDays(start, index)
    cells.push({ key: cellKey, inMonth: monthOf(cellKey) === monthOf(first) })
  }
  return cells
}

/** The weeks of a year, from the week that holds the 1st of January. */
export function yearMatrix(year: number, weekStartsOn = 0): { key: string; inYear: boolean }[][] {
  const first = dateKey(year, 0, 1)
  const lead = (weekdayOf(first) - weekStartsOn + 7) % 7
  const start = addDays(first, -lead)
  const totalDays = new Date(Date.UTC(year, 1, 29)).getUTCDate() === 29 ? 366 : 365
  const weekCount = Math.ceil((lead + totalDays) / 7)
  const weeks: { key: string; inYear: boolean }[][] = []
  for (let week = 0; week < weekCount; week += 1) {
    const days: { key: string; inYear: boolean }[] = []
    for (let day = 0; day < 7; day += 1) {
      const key = addDays(start, week * 7 + day)
      days.push({ key, inYear: yearOf(key) === year })
    }
    weeks.push(days)
  }
  return weeks
}

/** The number of days in a month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}
