import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { clearCache, load, peek, useResource } from './cache'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  clearCache()
})

describe('a failed read', () => {
  it('is not immediately retried by the resource effect', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline')
    })

    function Probe() {
      const resource = useResource('probe:failure', fetcher)
      return <p>{resource.error ? 'error' : 'loading'}</p>
    }

    await act(async () => {
      root.render(<Probe />)
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(container.textContent).toBe('error')
  })

  it('keeps the last good value when a refresh fails', async () => {
    let fail = false
    const fetcher = vi.fn(async () => {
      if (fail) throw new Error('offline')
      return 'first'
    })

    await expect(load('probe:refresh', fetcher)).resolves.toBe('first')
    fail = true
    await expect(load('probe:refresh', fetcher)).rejects.toThrow('offline')

    expect(peek('probe:refresh')).toBe('first')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
