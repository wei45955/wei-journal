import { describe, expect, it } from 'vitest'
import { highlightParts, safeColor, safeFontSize, safeHref } from './safe'

describe('safeHref', () => {
  it('keeps web and mail links', () => {
    expect(safeHref('https://example.com')).toBe('https://example.com')
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c')
  })

  it('refuses script and data links', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref(' JaVaScRiPt:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<script>')).toBeNull()
    expect(safeHref(42)).toBeNull()
  })
})

describe('safeColor', () => {
  it('accepts the colours the editor writes', () => {
    expect(safeColor('#27467a')).toBe('#27467a')
    expect(safeColor('rgb(1, 2, 3)')).toBe('rgb(1, 2, 3)')
  })

  it('refuses anything that could carry more than a colour', () => {
    expect(safeColor('red; background:url(x)')).toBeNull()
    expect(safeColor('expression(alert(1))')).toBeNull()
  })
})

describe('safeFontSize', () => {
  it('keeps a size inside the readable range', () => {
    expect(safeFontSize('20px')).toBe('20px')
    expect(safeFontSize('1.25rem')).toBe('1.25rem')
    expect(safeFontSize('200px')).toBeNull()
    expect(safeFontSize('calc(1px)')).toBeNull()
  })
})

describe('highlightParts', () => {
  it('marks every occurrence of the words, ignoring case', () => {
    const parts = highlightParts('Rain in the morning, rain at night', 'rain')
    expect(parts.filter((part) => part.hit).map((part) => part.text)).toEqual(['Rain', 'rain'])
    expect(parts.map((part) => part.text).join('')).toBe('Rain in the morning, rain at night')
  })

  it('treats the query as text, not as a pattern', () => {
    const parts = highlightParts('a (b) c', '(b)')
    expect(parts.find((part) => part.hit)?.text).toBe('(b)')
  })

  it('handles Chinese text', () => {
    const parts = highlightParts('今天去了西湖，西湖很美', '西湖')
    expect(parts.filter((part) => part.hit)).toHaveLength(2)
  })
})
