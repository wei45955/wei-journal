import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * The way back, also when the page was opened from a link.
 *
 * A page that was opened directly has nothing in this tab's history to
 * return to, so it goes to `fallback` instead of leaving the application.
 */
export function useBack(fallback = '/') {
  const navigate = useNavigate()
  const location = useLocation()

  return useCallback(() => {
    const remembered = (location.state as { from?: unknown } | null)?.from
    if (location.key === 'default') {
      const target =
        typeof remembered === 'string' &&
        remembered.startsWith('/') &&
        !remembered.startsWith('//')
          ? remembered
          : fallback
      navigate(target, { replace: true })
      return
    }
    navigate(-1)
  }, [fallback, location.key, location.state, navigate])
}

/** The place a page should return to after an entry is removed. */
export function useReturnPath(fallback = '/'): string {
  const location = useLocation()
  const remembered = (location.state as { from?: unknown } | null)?.from
  return typeof remembered === 'string' &&
    remembered.startsWith('/') &&
    !remembered.startsWith('//')
    ? remembered
    : fallback
}
