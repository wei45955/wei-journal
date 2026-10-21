import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { User } from '../lib/types'
import { browserTimezone } from '../lib/format'
import { applyTheme } from '../lib/theme'
import { resetFolderCache } from '../hooks/useFolders'
import { resetTagCache } from '../hooks/useTags'
import { setLanguage } from '../i18n'
import type { LanguageCode } from '../i18n'

interface AuthState {
  user: User | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<void>
  signUp: (username: string, password: string, email?: string) => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
  updateUser: (user: User) => void
}

const AuthContext = createContext<AuthState | null>(null)

/** Applies the account's saved language and theme to the document. */
function applyPreferences(user: User) {
  const language = user.settings?.language
  if (language === 'en' || language === 'zh-CN') {
    setLanguage(language as LanguageCode)
  }
  const theme = user.settings?.theme
  if (theme === 'light' || theme === 'dark' || theme === 'system') {
    applyTheme(theme)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const me = await api.me()
      setUser(me.user)
      applyPreferences(me.user)
    } catch (error) {
      // Only a rejected session signs the reader out. A network failure
      // leaves the account that is already on screen in place.
      if (error instanceof ApiError && error.isUnauthorized) setUser(null)
    }
  }, [])

  useEffect(() => {
    let active = true
    void (async () => {
      await refreshUser()
      if (active) setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [refreshUser])

  // Opening the journal, or coming back to it, slides the session forward.
  // A network failure leaves the signed-in state alone; only a rejected
  // session sends the reader to sign in.
  const fixingTimezone = useRef(false)
  useEffect(() => {
    if (!user || fixingTimezone.current) return
    if (localStorage.getItem('wj-tz-default-fixed') === '1') return
    const tz = user.settings?.timezone ?? ''
    if (tz && tz !== 'UTC') {
      localStorage.setItem('wj-tz-default-fixed', '1')
      return
    }
    // The old default was UTC, which made every clock eight hours off in
    // China. Follow the phone from now on, and move existing days with it.
    fixingTimezone.current = true
    const zone = browserTimezone()
    void api
      .updateSettings({ timezone: 'auto', alignZone: zone })
      .then((settings) => {
        localStorage.setItem('wj-tz-default-fixed', '1')
        setUser((current) => (current ? { ...current, settings } : current))
      })
      .catch(() => {
        fixingTimezone.current = false
      })
  }, [user])

  const signedIn = user !== null
  useEffect(() => {
    if (!signedIn) return
    let pending = false
    const keepAlive = () => {
      if (pending || document.visibilityState === 'hidden') return
      pending = true
      void api
        .me()
        .then((me) => {
          setUser(me.user)
          applyPreferences(me.user)
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.isUnauthorized) setUser(null)
        })
        .finally(() => {
          pending = false
        })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') keepAlive()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    const timer = window.setInterval(keepAlive, 6 * 60 * 60 * 1000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      window.clearInterval(timer)
    }
  }, [signedIn])

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await api.login(username, password)
    setUser(result.user)
    applyPreferences(result.user)
  }, [])

  const signUp = useCallback(async (username: string, password: string, email?: string) => {
    const result = await api.register(username, password, email)
    setUser(result.user)
    applyPreferences(result.user)
  }, [])

  const signOut = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
      resetFolderCache()
      resetTagCache()
    }
  }, [])

  // The shared caches live outside React. A change of account, including a
  // session that has expired, must not let one account see the folders or
  // tags of the previous one.
  const lastUserId = useRef<number | undefined>(undefined)
  useEffect(() => {
    const current = user?.id
    if (lastUserId.current !== current) {
      if (lastUserId.current !== undefined) {
        resetFolderCache()
        resetTagCache()
      }
      lastUserId.current = current
    }
  }, [user?.id])

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signUp, signOut, refreshUser, updateUser: setUser }),
    [user, loading, signIn, signUp, signOut, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
