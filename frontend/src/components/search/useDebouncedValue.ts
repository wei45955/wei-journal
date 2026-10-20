import { useEffect, useState } from 'react'

/**
 * Returns the value once it has stopped changing for the given delay.
 *
 * The search field uses this so a request is only sent after the reader
 * stops typing, instead of on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])

  return debounced
}
