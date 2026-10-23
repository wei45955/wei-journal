/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { Settings, User } from '../lib/types'
import { browserTimezone } from '../lib/format'
import { applyTheme } from '../lib/theme'
import { clearCache } from '../lib/cache'
import { clearDrafts } from '../lib/drafts'
import { setLanguage } from '../i18n'

interface AuthState {
  user: User | null
  /** True until the server has said who the visitor is. */
  checking: boolean
  signIn: (username: string, password: string) => Promise<void>
  signUp: (username: string, password: string, email?: string) => Promise<void>
  signOut: () => Promise<void>
  setSettings: (settings: Settings) => void
}

const AuthContext = createContext<AuthState | null>(null)

function applyPreferences(user: User) {
  const { language, theme } = user.settings ?? {}
  if (language === 'en' || language === 'zh-CN') setLanguage(language)
  if (theme === 'light' || theme === 'dark' || theme === 'system') applyTheme(theme)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)

  const currentId = useRef<number | undefined>(undefined)
  const adopt = useCallback((next: User | null) => {
    // The caches live outside React; another account must never see them.
    if (currentId.current !== next?.id) {
      clearCache()
      currentId.current = next?.id
    }
    setUser(next)
    if (next) applyPreferences(next)
  }, [])

  useEffect(() => {
    let active = true
    api
      .me()
      .then((me) => active && adopt(me.user))
      .catch((error: unknown) => {
        if (active && error instanceof ApiError && error.isUnauthorized) adopt(null)
      })
      .finally(() => active && setChecking(false))
    return () => {
      active = false
    }
  }, [adopt])

  // Coming back to the app slides the session forward. A network failure
  // leaves the signed-in state alone; only a rejected session signs out.
  const signedIn = user !== null
  useEffect(() => {
    if (!signedIn) return
    let pending = false
    const refresh = () => {
      if (pending || document.visibilityState === 'hidden') return
      pending = true
      api
        .me()
        .then((me) => adopt(me.user))
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isUnauthorized) adopt(null)
        })
        .finally(() => {
          pending = false
        })
    }
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    const timer = window.setInterval(refresh, 6 * 60 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.clearInterval(timer)
    }
  }, [signedIn, adopt])

  // Older accounts were created with UTC as the zone, which put every day
  // eight hours off in China. Such an account is switched to follow the
  // device once.
  const aligning = useRef(false)
  useEffect(() => {
    if (!user || aligning.current) return
    const zone = user.settings?.timezone ?? ''
    if (zone && zone !== 'UTC') return
    try {
      if (localStorage.getItem('wj-tz-default-fixed') === '1') return
    } catch {
      return
    }
    aligning.current = true
    api
      .updateSettings({ timezone: 'auto', alignZone: browserTimezone() })
      .then((settings) => {
        localStorage.setItem('wj-tz-default-fixed', '1')
        setUser((current) => (current ? { ...current, settings } : current))
      })
      .catch(() => {
        aligning.current = false
      })
  }, [user])

  const signIn = useCallback(
    async (username: string, password: string) => {
      const result = await api.login(username, password)
      adopt(result.user)
    },
    [adopt],
  )

  const signUp = useCallback(
    async (username: string, password: string, email?: string) => {
      const result = await api.register(username, password, email)
      adopt(result.user)
    },
    [adopt],
  )

  const signOut = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      clearDrafts()
      adopt(null)
    }
  }, [adopt])

  const setSettings = useCallback((settings: Settings) => {
    setUser((current) => (current ? { ...current, settings } : current))
  }, [])

  const value = useMemo(
    () => ({ user, checking, signIn, signUp, signOut, setSettings }),
    [user, checking, signIn, signUp, signOut, setSettings],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

/** The preferences the views need, with the defaults filled in. */
export function usePrefs() {
  const { user } = useAuth()
  const settings = user?.settings
  return {
    language: settings?.language === 'zh-CN' ? 'zh-CN' : 'en',
    zone: settings?.timezone,
    dateFormat: settings?.dateFormat,
    settings,
  }
}
