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

/** Used when the phone does not report a time zone. */
export const FALLBACK_TIMEZONE = 'Asia/Shanghai'

/** Stored on the account when the journal should follow the phone. */
export const AUTO_TIMEZONE = 'auto'

/** The phone's time zone, or Shanghai when it cannot be read. */
export function browserTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (zone) return zone
  } catch {
    // Intl can throw in a locked-down web view.
  }
  return FALLBACK_TIMEZONE
}

/**
 * The zone used to show a moment and to decide which day it belongs to.
 * An empty value or "auto" follows the phone. A chosen IANA name wins.
 */
export function displayTimezone(settingsZone?: string): string {
  const zone = (settingsZone ?? '').trim()
  if (!zone || zone === AUTO_TIMEZONE) return browserTimezone()
  try {
    Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0)
    return zone
  } catch {
    return browserTimezone()
  }
}

/** A wall-clock value for `<input type="datetime-local">` in `timeZone`. */
export function isoToWallInput(iso: string, timeZone?: string): string {
  const date = parseISO(iso)
  if (!isValid(date)) return ''
  const zone = timeZone || browserTimezone()
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date)
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
    const hour = get('hour') === '24' ? '00' : get('hour')
    return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`
  } catch {
    return ''
  }
}

/** Turns a datetime-local wall time in `timeZone` back into a UTC instant. */
export function wallInputToISO(value: string, timeZone?: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return new Date().toISOString()
  const zone = timeZone || browserTimezone()
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute)
  const offsetAt = (instant: number) => zoneOffsetMs(new Date(instant), zone)
  let offset = offsetAt(utcGuess)
  let instant = utcGuess - offset
  const next = offsetAt(instant)
  if (next !== offset) instant = utcGuess - next
  return new Date(instant).toISOString()
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUTC - date.getTime()
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

/** Zones offered in the settings menu. The value is an IANA name. */
export const TIMEZONE_CHOICES: { value: string; zh: string; en: string }[] = [
  { value: 'Asia/Shanghai', zh: '中国上海', en: 'Shanghai' },
  { value: 'Asia/Hong_Kong', zh: '中国香港', en: 'Hong Kong' },
  { value: 'Asia/Taipei', zh: '中国台北', en: 'Taipei' },
  { value: 'Asia/Tokyo', zh: '东京', en: 'Tokyo' },
  { value: 'Asia/Seoul', zh: '首尔', en: 'Seoul' },
  { value: 'Asia/Singapore', zh: '新加坡', en: 'Singapore' },
  { value: 'Asia/Kolkata', zh: '加尔各答', en: 'Kolkata' },
  { value: 'Europe/London', zh: '伦敦', en: 'London' },
  { value: 'Europe/Paris', zh: '巴黎', en: 'Paris' },
  { value: 'Europe/Berlin', zh: '柏林', en: 'Berlin' },
  { value: 'Europe/Moscow', zh: '莫斯科', en: 'Moscow' },
  { value: 'America/New_York', zh: '纽约', en: 'New York' },
  { value: 'America/Chicago', zh: '芝加哥', en: 'Chicago' },
  { value: 'America/Denver', zh: '丹佛', en: 'Denver' },
  { value: 'America/Los_Angeles', zh: '洛杉矶', en: 'Los Angeles' },
  { value: 'Australia/Sydney', zh: '悉尼', en: 'Sydney' },
  { value: 'Pacific/Auckland', zh: '奥克兰', en: 'Auckland' },
  { value: 'UTC', zh: '世界时', en: 'UTC' },
]
