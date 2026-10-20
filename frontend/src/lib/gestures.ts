/**
 * The page itself never zooms.
 *
 * A pinch on the screen should magnify a photograph inside the media viewer,
 * never the layout around it. The viewport hint in `index.html` covers most
 * browsers, but Safari ignores it and fires its own pinch events, so those
 * are stopped as well. Anything marked with `data-allow-zoom` opts out and
 * handles its own gestures.
 */

const ZOOMABLE = '[data-allow-zoom]'

function isInsideZoomable(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(ZOOMABLE))
}

/** Stops the browser from zooming the page. Returns a teardown function. */
export function preventPageZoom(): () => void {
  const onGesture = (event: Event) => {
    if (isInsideZoomable(event.target)) return
    event.preventDefault()
  }

  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length < 2) return
    if (isInsideZoomable(event.target)) return
    event.preventDefault()
  }

  const onDoubleClick = (event: MouseEvent) => {
    if (isInsideZoomable(event.target)) return
    event.preventDefault()
  }

  // A trackpad pinch arrives as a wheel with the control key held. It zooms
  // the browser rather than the page, so it is stopped here as well.
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return
    if (isInsideZoomable(event.target)) return
    event.preventDefault()
  }

  document.addEventListener('gesturestart', onGesture, { passive: false })
  document.addEventListener('gesturechange', onGesture, { passive: false })
  document.addEventListener('gestureend', onGesture, { passive: false })
  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('dblclick', onDoubleClick, { passive: false })
  document.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    document.removeEventListener('gesturestart', onGesture)
    document.removeEventListener('gesturechange', onGesture)
    document.removeEventListener('gestureend', onGesture)
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('dblclick', onDoubleClick)
    document.removeEventListener('wheel', onWheel)
  }
}
