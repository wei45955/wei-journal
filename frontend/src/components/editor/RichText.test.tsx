import { describe, expect, it } from 'vitest'
import { safeHref } from './RichText'

describe('safeHref', () => {
  it('keeps the usual link protocols', () => {
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a')
    expect(safeHref('http://example.com')).toBe('http://example.com')
    expect(safeHref('mailto:someone@example.com')).toBe('mailto:someone@example.com')
  })

  it('rejects a script URL', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref('JavaScript:alert(1)')).toBeNull()
    expect(safeHref('  javascript:alert(1)')).toBeNull()
  })

  it('rejects a data URL', () => {
    expect(safeHref('data:text/html;base64,PHNjcmlwdD4=')).toBeNull()
    expect(safeHref('data:image/svg+xml,<svg onload=alert(1)>')).toBeNull()
  })

  it('rejects a protocol relative URL to another scheme', () => {
    expect(safeHref('vbscript:msgbox(1)')).toBeNull()
    expect(safeHref('file:///etc/passwd')).toBeNull()
  })

  it('rejects anything that is not a string', () => {
    expect(safeHref(undefined)).toBeNull()
    expect(safeHref(null)).toBeNull()
    expect(safeHref(42)).toBeNull()
    expect(safeHref({})).toBeNull()
    expect(safeHref('')).toBeNull()
  })

  it('keeps a relative link, which resolves against the page', () => {
    expect(safeHref('/entries/1')).toBe('/entries/1')
  })
})
