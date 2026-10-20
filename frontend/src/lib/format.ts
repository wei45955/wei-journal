/**
 * Date and number formatting that follows the user's preferences.
 */

import { format, formatDistanceToNow, isToday, isYesterday, isValid, parseISO } from 'date-fns'
import { enUS, zhCN } from 'date-fns/locale'

const locales: Record<string, Locale> = {
  en: enUS,
  'zh-CN': zhCN,
}

export type Locale = typeof enUS

export function localeFor(language: string): Locale {
  return locales[language] ?? enUS
}

/** Formats an ISO timestamp for display. */
export function formatDateTime(iso: string, language = 'en', pattern = 'PPP p'): string {
  const date = parseISO(iso)
  if (!isValid(date)) return ''
  return format(date, pattern, { locale: localeFor(language) })
}

export function formatDate(iso: string, language = 'en', pattern = 'PPP'): string {
  return formatDateTime(iso, language, pattern)
}

/** Formats the event date, which the server already resolved to a local day. */
export function formatEventDate(eventDate: string, language = 'en'): string {
  const date = parseISO(eventDate + 'T00:00:00')
  if (!isValid(date)) return eventDate
  return format(date, 'PPP', { locale: localeFor(language) })
}

/** A short relative description such as "3 days ago". */
export function formatRelative(iso: string, language = 'en'): string {
  const date = parseISO(iso)
  if (!isValid(date)) return ''
  return formatDistanceToNow(date, { addSuffix: true, locale: localeFor(language) })
}

/** A short time of day, in the zone the moment was written in. */
export function formatTime(iso: string, language = 'en', timeZone?: string): string {
  const date = parseISO(iso)
  if (!isValid(date)) return ''
  try {
    return new Intl.DateTimeFormat(language, {
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(date)
  } catch {
    return format(date, 'p', { locale: localeFor(language) })
  }
}

/** The heading used above a group of entries in the timeline. */
export function dayHeading(eventDate: string, language = 'en'): string {
  const date = parseISO(eventDate + 'T00:00:00')
  if (!isValid(date)) return eventDate
  const now = new Date()
  if (isToday(date)) {
    return language === 'zh-CN' ? '今天' : 'Today'
  }
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isYesterday(date)) {
    return language === 'zh-CN' ? '昨天' : 'Yesterday'
  }
  const sameYear = date.getFullYear() === now.getFullYear()
  return format(date, sameYear ? 'EEEE, MMMM d' : 'PPP', { locale: localeFor(language) })
}

/** Formats a byte count for display. */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  const rounded = value >= 100 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10
  return `${rounded} ${units[unit]}`
}

/** Formats a number with the locale's separators. */
export function formatNumber(value: number, language = 'en'): string {
  return new Intl.NumberFormat(language).format(value)
}

/** The browser's own timezone, used as the default when none is stored. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * The calendar day a moment belongs to, as YYYY-MM-DD, in the given zone.
 * The server groups entries by the same key, so both sides agree.
 */
export function localDateKey(date: Date, timezone?: string): string {
  if (!timezone) {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return localDateKey(date)
  }
}

/** A short list of common zones, with the browser's own zone first. */
export const COMMON_TIMEZONES: string[] = Array.from(
  new Set([
    browserTimezone(),
    'UTC',
    'Asia/Shanghai',
    'Asia/Hong_Kong',
    'Asia/Taipei',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Singapore',
    'Asia/Kolkata',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Moscow',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Australia/Sydney',
    'Pacific/Auckland',
  ]),
)
