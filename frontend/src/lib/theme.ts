/**
 * The colour scheme of the document.
 *
 * The choice is stored in the browser as well as on the account, so the
 * first paint of the next launch is already in the right theme. The inline
 * script in `index.html` reads the same key before React starts.
 */

export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'wj.theme'

const LIGHT_COLOR = '#f2f2f7'
const DARK_COLOR = '#000000'

function updateThemeColor(theme: ThemeChoice) {
  const head = document.head
  if (!head) return
  const metas = Array.from(
    head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
  )
  for (const meta of metas) {
    if (theme === 'system') {
      const light = meta.media.includes('light') || !meta.media
      meta.content = light ? LIGHT_COLOR : DARK_COLOR
    } else {
      meta.content = theme === 'light' ? LIGHT_COLOR : DARK_COLOR
    }
  }
}

/** Applies a theme to the document and remembers it for the next launch. */
export function applyTheme(theme: ThemeChoice) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', theme)

  updateThemeColor(theme)

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // The theme still applies to this page; it just will not survive a reload.
  }
}
