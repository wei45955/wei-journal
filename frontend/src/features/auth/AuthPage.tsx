import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../lib/api'
import { localDateKey, longDate } from '../../lib/format'
import { setLanguage } from '../../i18n'
import { useAuth } from '../../state/auth'
import { useToast } from '../../state/toast'
import { Button, TextInput } from '../../ui'

function safeReturn(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/signin') || value.startsWith('/signup')) return '/'
  return value
}

/**
 * Signing in opens on today's page: the date, written the way the journal
 * writes it, waiting for the first line.
 */
export function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, checking, signIn, signUp } = useAuth()
  const { describe } = useToast()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const signingUp = mode === 'signup'
  const language = i18n.language === 'zh-CN' ? 'zh-CN' : 'en'
  const target = safeReturn((location.state as { from?: unknown } | null)?.from)

  if (!checking && user) return <Navigate to={target} replace />

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!username.trim() || !password) return setError(t('errors.validation'))
    if (signingUp && password.length < 8) return setError(t('auth.tooShort'))
    setBusy(true)
    try {
      if (signingUp) await signUp(username.trim(), password, email.trim() || undefined)
      else await signIn(username.trim(), password)
      navigate(target, { replace: true })
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) setError(t('auth.invalid'))
      else if (reason instanceof ApiError && reason.status === 409) setError(t('auth.taken'))
      else setError(describe(reason))
    } finally {
      setBusy(false)
    }
  }

  const today = longDate(localDateKey(new Date()), language)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col px-6 pt-[calc(env(safe-area-inset-top)+3.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <p className="text-[0.9375rem] text-ink-2">{t('app.name')}</p>
      <h1 className="mt-2 font-serif text-[2.5rem] leading-[1.08] font-medium tracking-[-0.015em] text-ink [font-variation-settings:'opsz'_72] animate-rise">
        {today}
      </h1>
      <div className="mt-5 h-px w-12 bg-accent" aria-hidden="true" />
      <p className="mt-5 font-serif text-[1.125rem] leading-relaxed text-ink-2">
        {signingUp ? t('auth.signUpLead') : t('auth.signInLead')}
      </p>

      <form onSubmit={submit} className="mt-9 flex flex-col gap-3" noValidate>
        <TextInput
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t('auth.username')}
          aria-label={t('auth.username')}
          value={username}
          invalid={Boolean(error)}
          onChange={(event) => setUsername(event.target.value)}
          className="bg-leaf"
        />
        {signingUp ? (
          <TextInput
            name="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder={t('auth.email')}
            aria-label={t('auth.email')}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="bg-leaf"
          />
        ) : null}
        <TextInput
          name="password"
          type="password"
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          placeholder={t('auth.password')}
          aria-label={t('auth.password')}
          value={password}
          invalid={Boolean(error)}
          onChange={(event) => setPassword(event.target.value)}
          className="bg-leaf"
        />
        {error ? (
          <p role="alert" className="px-1 text-[0.875rem] text-danger animate-fade">
            {error}
          </p>
        ) : null}
        <Button type="submit" tone="primary" size="lg" block loading={busy} className="mt-2">
          {signingUp ? t('auth.signUp') : t('auth.signIn')}
        </Button>
      </form>

      {signingUp ? <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-3">{t('auth.firstAdmin')}</p> : null}

      <div className="mt-auto flex items-center justify-between gap-4 pt-10 text-[0.9375rem]">
        <p className="text-ink-2">
          {signingUp ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
          <Link to={signingUp ? '/signin' : '/signup'} state={location.state} replace className="font-medium text-accent">
            {signingUp ? t('auth.toSignIn') : t('auth.toSignUp')}
          </Link>
        </p>
        <button
          type="button"
          onClick={() => setLanguage(language === 'zh-CN' ? 'en' : 'zh-CN')}
          className="press h-9 rounded-full px-3 text-[0.875rem] text-ink-2"
        >
          {language === 'zh-CN' ? 'English' : '中文'}
        </button>
      </div>
    </main>
  )
}
