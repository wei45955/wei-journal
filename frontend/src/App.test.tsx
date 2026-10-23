import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import './i18n'
import App from './App'

function mockApi(handler: (url: string) => { status: number; body: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const { status, body } = handler(String(input))
      return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as Response
    }),
  )
}

const signedOut = () => ({ status: 401, body: { error: { code: 'unauthorized', message: 'not signed in' } } })

const user = {
  id: 1,
  username: 'tester',
  email: '',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
  settings: {
    language: 'en',
    timezone: 'Asia/Shanghai',
    theme: 'system',
    dateFormat: 'PPP',
    aiEnabled: false,
    mapTileUrl: '',
    compressImages: true,
    imageQuality: 80,
    imageMaxDimension: 2048,
  },
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function renderAt(path: string) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>,
    )
  })
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
}

describe('the application', () => {
  it('asks a visitor to sign in', async () => {
    mockApi(signedOut)
    await renderAt('/')
    expect(container.querySelector('input[type="password"]')).not.toBeNull()
    expect(container.textContent).toContain('Sign in')
  })

  it('opens the journal of a signed in account', async () => {
    mockApi((url) => {
      if (url.includes('/api/auth/me')) return { status: 200, body: { data: { user, csrfToken: 'x' } } }
      if (url.includes('/api/entries')) return { status: 200, body: { data: [], meta: { hasMore: false } } }
      return { status: 200, body: { data: [] } }
    })
    await renderAt('/')
    expect(container.textContent).toContain('All entries')
    expect(container.textContent).toContain('Nothing written yet')
  })

  it('shows the entries grouped by day', async () => {
    mockApi((url) => {
      if (url.includes('/api/auth/me')) return { status: 200, body: { data: { user, csrfToken: 'x' } } }
      if (url.includes('/api/entries'))
        return {
          status: 200,
          body: {
            data: [
              {
                id: 7,
                title: 'Rain on the lake',
                eventTime: '2026-03-14T02:00:00Z',
                eventDate: '2026-03-14',
                timezone: 'Asia/Shanghai',
                document: { type: 'doc', content: [] },
                drawing: [],
                plainText: 'The water went grey before noon.',
                color: '',
                isPinned: false,
                wordCount: 7,
                revision: 1,
                createdAt: '2026-03-14T02:00:00Z',
                updatedAt: '2026-03-14T02:00:00Z',
                tags: [{ id: 1, name: 'walks', color: '', entryCount: 1, createdAt: '' }],
                media: [],
                aiMetadata: [],
              },
            ],
            meta: { hasMore: false },
          },
        }
      return { status: 200, body: { data: [] } }
    })
    await renderAt('/')
    expect(container.textContent).toContain('Rain on the lake')
    expect(container.textContent).toContain('#walks')
    expect(container.textContent).toContain('14')
  })
})
