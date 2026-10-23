import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useRef, useState } from 'react'
import { Popover } from './Popover'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  // The panel watches its own size so it can find its place again.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function Harness() {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={anchor} onClick={() => setOpen((value) => !value)}>
        open
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchor} label="choices">
        <button type="button">inside</button>
      </Popover>
    </>
  )
}

const panel = () => document.body.querySelector('[role="dialog"]')

describe('the popover', () => {
  it('opens beside the control that asked for it', async () => {
    await act(async () => {
      root.render(<Harness />)
    })
    expect(panel()).toBeNull()

    await act(async () => {
      container.querySelector('button')?.click()
    })
    expect(panel()).not.toBeNull()
    // It is drawn on the body, so no bar or page can clip it.
    expect(panel()?.parentElement).toBe(document.body)
    expect(panel()?.getAttribute('aria-label')).toBe('choices')
  })

  it('closes when the finger lands anywhere else', async () => {
    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {
      container.querySelector('button')?.click()
    })
    expect(panel()).not.toBeNull()

    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(panel()).toBeNull()
  })

  it('stays open when the finger lands inside it', async () => {
    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {
      container.querySelector('button')?.click()
    })

    await act(async () => {
      panel()?.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(panel()).not.toBeNull()
  })

  it('closes on the escape key', async () => {
    await act(async () => {
      root.render(<Harness />)
    })
    await act(async () => {
      container.querySelector('button')?.click()
    })

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(panel()).toBeNull()
  })
})
