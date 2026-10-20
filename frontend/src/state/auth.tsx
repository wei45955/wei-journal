import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, ApiError } from '../lib/api'
import type { User } from '../lib/types'
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
    if (theme === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', theme)
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
      if (!(error instanceof ApiError) || !error.isUnauthorized) {
        // A network failure is not the same as being signed out, but there is
        // no usable session to work with either way.
      }
      setUser(null)
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
    }
  }, [])

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
