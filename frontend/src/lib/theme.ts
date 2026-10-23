/**
 * The colour scheme of the document. The choice is mirrored in local storage
 * so the inline script in index.html can apply it before the first paint.
 */

export type ThemeChoice = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'wj.theme'
const LIGHT = '#edeff2'
const DARK = '#0d1219'

function systemIsDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

function paintStatusBar(dark: boolean) {
  const metas = document.head?.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]') ?? []
  for (const meta of Array.from(metas)) meta.content = dark ? DARK : LIGHT
}

export function applyTheme(theme: ThemeChoice) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
  paintStatusBar(theme === 'dark' || (theme === 'system' && systemIsDark()))
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // The theme still applies to this page.
  }
}

/** Keeps the status bar colour in step when the system switches theme. */
export function followSystemTheme(): () => void {
  const query = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!query) return () => undefined
  const onChange = () => {
    if (!document.documentElement.hasAttribute('data-theme')) paintStatusBar(query.matches)
  }
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
