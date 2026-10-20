// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

/**
 * A minimal stand-in for the API. Every test drives the real application
 * shell, so a broken route, a missing translation or a provider that throws
 * during the first render shows up here.
 */
function mockApi(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    const { status, body } = handler(url, init)
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // React only treats act(...) as a supported call in a test environment.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
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
  // The auth provider asks the server who the visitor is before it shows
  // anything, so the first render is the loading state.
  await act(async () => {
    await Promise.resolve()
  })
}

describe('the application', () => {
  it('shows the sign in page to a visitor who is not signed in', async () => {
    mockApi(() => ({
      status: 401,
      body: { error: { code: 'unauthorized', message: 'not signed in' } },
    }))

    await renderAt('/signin')

    expect(container.textContent).toContain('Welcome back')
    expect(container.querySelector('input[type="password"]')).not.toBeNull()
  })

  it('sends a visitor who is not signed in to the sign in page', async () => {
    mockApi(() => ({
      status: 401,
      body: { error: { code: 'unauthorized', message: 'not signed in' } },
    }))

    await renderAt('/')

    expect(container.textContent).toContain('Welcome back')
  })

  it('shows the timeline of a signed in account', async () => {
    mockApi((url) => {
      if (url.includes('/api/auth/me')) {
        return {
          status: 200,
          body: {
            data: {
              user: {
                id: 1,
                username: 'tester',
                email: '',
                role: 'admin',
                createdAt: '2026-01-01T00:00:00Z',
                settings: {
                  language: 'en',
                  timezone: 'UTC',
                  theme: 'system',
                  dateFormat: 'YYYY-MM-DD',
                  aiEnabled: false,
                  mapTileUrl: '',
                },
              },
              csrfToken: 'token',
            },
          },
        }
      }
      return { status: 200, body: { data: [], meta: { hasMore: false, limit: 20 } } }
    })

    await renderAt('/')

    // The account name is in the shell, so the signed in state is proven.
    expect(container.textContent).toContain('tester')
  })
})
