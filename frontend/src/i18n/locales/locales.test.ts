import { describe, expect, it } from 'vitest'
import { en } from './en'
import { zhCN } from './zh-CN'

/** Every leaf key of a nested translation object, as a dotted path. */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix]
  }
  const out: string[] = []
  for (const [key, child] of Object.entries(value)) {
    out.push(...keyPaths(child, prefix ? `${prefix}.${key}` : key))
  }
  return out
}

describe('the translation resources', () => {
  it('have the same keys in both languages', () => {
    const english = new Set(keyPaths(en))
    const chinese = new Set(keyPaths(zhCN))

    const missingInChinese = [...english].filter((key) => !chinese.has(key)).sort()
    const missingInEnglish = [...chinese].filter((key) => !english.has(key)).sort()

    expect(missingInChinese, 'keys that the Chinese resource is missing').toEqual([])
    expect(missingInEnglish, 'keys that the English resource is missing').toEqual([])
  })

  it('have no empty translations', () => {
    const empty: string[] = []
    for (const [name, resource] of [['en', en], ['zh-CN', zhCN]] as const) {
      for (const path of keyPaths(resource)) {
        const value = path.split('.').reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)[part],
          resource,
        )
        if (typeof value === 'string' && value.trim() === '') {
          empty.push(`${name}.${path}`)
        }
      }
    }
    expect(empty).toEqual([])
  })

  it('keep the interpolation placeholders of both languages in step', () => {
    const placeholders = (text: string) =>
      (text.match(/\{\{\s*[\w.]+\s*\}\}/g) ?? []).map((p) => p.replace(/\s/g, '')).sort()

    const mismatched: string[] = []
    for (const path of keyPaths(en)) {
      const read = (resource: unknown) =>
        path.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], resource)
      const english = read(en)
      const chinese = read(zhCN)
      if (typeof english !== 'string' || typeof chinese !== 'string') continue
      const a = placeholders(english)
      const b = placeholders(chinese)
      if (a.join(',') !== b.join(',')) {
        mismatched.push(`${path}: ${a.join(',')} vs ${b.join(',')}`)
      }
    }
    expect(mismatched).toEqual([])
  })
})
