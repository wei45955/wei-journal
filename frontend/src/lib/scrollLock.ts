/**
 * Locks the page while a full screen surface is open.
 *
 * On iOS, `overflow: hidden` alone does not stop the page behind a dialog
 * from moving. Pinning the body in place does, and the scroll offset is put
 * back when the last surface closes.
 *
 * Pinning takes the body out of the flow, which would leave the document
 * with nothing in it and as tall as the window. The document keeps the
 * height it had, so the page does not collapse under the surface, and so
 * that iOS, which draws the previous page while the back gesture runs,
 * has a real page to draw.
 */

interface SavedBody {
  scrollY: number
  /** The page the lock was taken on, so a change of page is not undone. */
  path: string
  position: string
  top: string
  left: string
  right: string
  width: string
  overflow: string
}

interface SavedHtml {
  height: string
  overflow: string
}

let locks = 0
let saved: SavedBody | null = null
let savedHtml: SavedHtml | null = null

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined

  locks += 1
  if (locks === 1) {
    const body = document.body
    const root = document.documentElement
    const scrollY = window.scrollY
    saved = {
      scrollY,
      path: window.location.pathname + window.location.search,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
    }
    savedHtml = { height: root.style.height, overflow: root.style.overflow }
    // The height of the page is kept, so the document does not shrink to
    // the window while the body is pinned.
    root.style.height = `${root.scrollHeight}px`
    root.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
  }

  let released = false
  return () => {
    if (released) return
    released = true
    locks = Math.max(0, locks - 1)
    if (locks > 0 || !saved) return

    const body = document.body
    const root = document.documentElement
    body.style.position = saved.position
    body.style.top = saved.top
    body.style.left = saved.left
    body.style.right = saved.right
    body.style.width = saved.width
    body.style.overflow = saved.overflow
    if (savedHtml) {
      root.style.height = savedHtml.height
      root.style.overflow = savedHtml.overflow
      savedHtml = null
    }
    // Restoring a place on a page that has just been replaced would open the
    // next page halfway down. A new page handles its own scroll.
    if (window.location.pathname + window.location.search === saved.path) {
      window.scrollTo(0, saved.scrollY)
    }
    saved = null
  }
}
