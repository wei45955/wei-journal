/**
 * Small guards for values that come from stored content.
 */

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:']

/** A link target that cannot run script, or null. */
export function safeHref(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const url = new URL(raw, 'https://example.invalid')
    if (!SAFE_PROTOCOLS.includes(url.protocol)) return null
    return raw
  } catch {
    return null
  }
}

/** A colour from the editor, accepted only in the plain forms it writes. */
export function safeColor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value
  if (/^rgba?\(\s*[\d.\s,%]+\)$/i.test(value)) return value
  if (/^var\(--wj-[a-z0-9-]+\)$/i.test(value)) return value
  return null
}

const SIZE_PATTERN = /^(\d{1,2}(\.\d+)?)(px|rem|em)$/

/** A font size from the editor, kept within a readable range. */
export function safeFontSize(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const match = SIZE_PATTERN.exec(raw.trim())
  if (!match) return null
  const value = Number(match[1])
  const unit = match[3]
  const px = unit === 'px' ? value : value * 16
  if (px < 10 || px > 40) return null
  return `${value}${unit}`
}

/** Splits a snippet into plain and matching parts, without any markup. */
export function highlightParts(text: string, query: string): Array<{ text: string; hit: boolean }> {
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!text || terms.length === 0) return [{ text, hit: false }]
  const pattern = new RegExp(`(${terms.join('|')})`, 'gi')
  const parts: Array<{ text: string; hit: boolean }> = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    if (match[0].length === 0) continue
    if (index > last) parts.push({ text: text.slice(last, index), hit: false })
    parts.push({ text: match[0], hit: true })
    last = index + match[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false })
  return parts
}
