import { describe, expect, it } from 'vitest'
import { en } from './en'
import { zh } from './zh'

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => keysOf(child, prefix ? `${prefix}.${key}` : key))
}

function placeholders(text: string): string[] {
  return Array.from(text.matchAll(/\{\{(\w+)\}\}/g), (match) => match[1]).sort()
}

function valueAt(dictionary: unknown, path: string): string {
  return path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dictionary) as string
}

describe('the two dictionaries', () => {
  it('have the same keys', () => {
    expect(keysOf(zh).sort()).toEqual(keysOf(en).sort())
  })

  it('use the same placeholders', () => {
    for (const key of keysOf(en)) {
      expect(placeholders(valueAt(zh, key)), key).toEqual(placeholders(valueAt(en, key)))
    }
  })

  it('leave no value empty', () => {
    for (const key of keysOf(en)) {
      expect(valueAt(en, key).trim(), key).not.toBe('')
      expect(valueAt(zh, key).trim(), key).not.toBe('')
    }
  })
})
