import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './api'

interface Call {
  url: string
  init: RequestInit
}

/** Installs a fetch stub and records the calls that were made. */
function stubFetch(
  respond: (call: Call) => { status?: number; body?: unknown; text?: string },
): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const call = { url: String(input), init }
      calls.push(call)
      const { status = 200, body, text } = respond(call)
      const payload = text ?? JSON.stringify(body ?? { data: null })
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => payload,
      } as Response
    }),
  )
  return calls
}

function headerOf(call: Call, name: string): string | undefined {
  const headers = (call.init.headers ?? {}) as Record<string, string>
  return headers[name]
}

beforeEach(() => {
  document.cookie = 'wj_csrf=token-value; path=/'
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.cookie = 'wj_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

describe('the response envelope', () => {
  it('returns the payload and not the envelope', async () => {
    stubFetch(() => ({ body: { data: { id: 7, title: 'Rain' } } }))
    const entry = await api.entry(7)
    expect(entry).toEqual({ id: 7, title: 'Rain' })
  })

  it('throws the error code the server sent', async () => {
    stubFetch(() => ({
      status: 409,
      body: { error: { code: 'conflict', message: 'the entry changed' } },
    }))
    await expect(api.updateEntry(7, { title: 'x' })).rejects.toMatchObject({
      status: 409,
      code: 'conflict',
      message: 'the entry changed',
    })
  })

  it('carries the field details of a validation error', async () => {
    stubFetch(() => ({
      status: 400,
      body: {
        error: { code: 'invalid', message: 'check the fields', details: { title: 'too long' } },
      },
    }))
    try {
      await api.createEntry({ title: 'x' })
      expect.unreachable('the call should have failed')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      const apiError = error as ApiError
      expect(apiError.isValidation).toBe(true)
      expect(apiError.details).toEqual({ title: 'too long' })
    }
  })

  it('reports an unreachable server as a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(api.me()).rejects.toMatchObject({ status: 0, code: 'network_error' })
  })
})

describe('the CSRF token', () => {
  it('is sent on a mutating request', async () => {
    const calls = stubFetch(() => ({ body: { data: { id: 1 } } }))
    await api.createEntry({ title: 'a' })
    expect(headerOf(calls[0], 'X-CSRF-Token')).toBe('token-value')
  })

  it('is not sent on a read', async () => {
    const calls = stubFetch(() => ({ body: { data: [] } }))
    await api.entries()
    expect(headerOf(calls[0], 'X-CSRF-Token')).toBeUndefined()
  })
})

describe('the entry list', () => {
  it('turns the filters into query parameters', async () => {
    const calls = stubFetch(() => ({ body: { data: [] } }))
    await api.entries({
      folderId: 'none',
      tags: [3, 4],
      tagMode: 'all',
      from: '2026-01-01',
      to: '2026-01-31',
      mediaType: 'image',
      pinned: true,
      q: 'rain',
      limit: 20,
    })
    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/api/entries')
    expect(url.searchParams.get('folderId')).toBe('none')
    expect(url.searchParams.get('tags')).toBe('3,4')
    expect(url.searchParams.get('tagMode')).toBe('all')
    expect(url.searchParams.get('from')).toBe('2026-01-01')
    expect(url.searchParams.get('to')).toBe('2026-01-31')
    expect(url.searchParams.get('mediaType')).toBe('image')
    expect(url.searchParams.get('pinned')).toBe('true')
    expect(url.searchParams.get('q')).toBe('rain')
    expect(url.searchParams.get('limit')).toBe('20')
  })

  it('reads the page cursor from the envelope', async () => {
    stubFetch(() => ({
      body: { data: [{ id: 1 }], meta: { nextCursor: 'abc', hasMore: true, total: 9 } },
    }))
    const page = await api.entries()
    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).toBe('abc')
    expect(page.hasMore).toBe(true)
    expect(page.total).toBe(9)
  })
})

describe('the destructive calls', () => {
  it('previews a bulk operation without touching the entries', async () => {
    const calls = stubFetch(() => ({ body: { data: { count: 2, entryIds: [1, 2] } } }))
    const preview = await api.batchPreview({ action: 'delete', entryIds: [1, 2] })
    expect(calls[0].url).toContain('/api/batch/preview')
    expect(calls[0].init.method).toBe('POST')
    expect(preview.count).toBe(2)
  })

  it('asks for the confirmation when a folder is deleted for good', async () => {
    const calls = stubFetch(() => ({ body: { data: null } }))
    await api.deleteFolder(3, 'delete', true)
    const url = new URL(calls[0].url)
    expect(url.pathname).toBe('/api/folders/3')
    expect(url.searchParams.get('strategy')).toBe('delete')
    expect(url.searchParams.get('confirm')).toBe('true')
  })

  it('moves the entries out of a folder instead of deleting them', async () => {
    const calls = stubFetch(() => ({ body: { data: null } }))
    await api.deleteFolder(3, 'default', false)
    const url = new URL(calls[0].url)
    expect(url.searchParams.get('strategy')).toBe('default')
    expect(url.searchParams.get('confirm')).toBeNull()
  })
})

describe('the export', () => {
  it('leaves the media out unless it is asked for', async () => {
    const calls = stubFetch(() => ({ body: { data: {} } }))
    await api.exportJournal()
    expect(new URL(calls[0].url).searchParams.get('includeMedia')).toBeNull()
  })

  it('asks for the media when it is wanted', async () => {
    const calls = stubFetch(() => ({ body: { data: {} } }))
    await api.exportJournal(true)
    expect(new URL(calls[0].url).searchParams.get('includeMedia')).toBe('true')
  })
})
