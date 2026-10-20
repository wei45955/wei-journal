import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { ApiError } from '../lib/api'
import { Button, Field, TextInput } from '../components/ui'
import { Logo } from '../components/entries/Logo'

export function AuthPage({ mode }: { mode: 'signin' | 'signup' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { signIn, signUp } = useAuth()
  const { notify, describe } = useToast()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const isSignUp = mode === 'signup'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError(t('errors.validation'))
      return
    }
    setBusy(true)
    try {
      if (isSignUp) {
        await signUp(username.trim(), password, email.trim() || undefined)
        notify(t('auth.signUpTitle'), 'success')
      } else {
        await signIn(username.trim(), password)
        notify(t('auth.signInTitle'), 'success')
      }
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError(t('auth.usernameTaken'))
      } else if (err instanceof ApiError && err.status === 401) {
        setError(t('auth.invalidCredentials'))
      } else {
        setError(describe(err, t('errors.generic')))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-paper px-5 py-12 text-ink">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <span className="flex size-[4.5rem] items-center justify-center rounded-[1.75rem] shadow-float">
            <span className="flex size-full items-center justify-center rounded-[1.75rem]">
              <Logo size={46} />
            </span>
          </span>
          <h1 className="font-display text-[1.75rem] font-bold tracking-tight text-ink-strong">
            {isSignUp ? t('auth.signUpTitle') : t('auth.signInTitle')}
          </h1>
          <p className="max-w-xs text-[0.9375rem] text-ink-muted">
            {isSignUp ? t('auth.signUpSubtitle') : t('auth.signInSubtitle')}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="card flex flex-col gap-4 p-5 sm:p-6"
          noValidate
        >
          <Field label={t('auth.username')} htmlFor="username">
            <TextInput
              id="username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              invalid={Boolean(error)}
            />
          </Field>

          {isSignUp ? (
            <Field label={t('auth.email')} htmlFor="email">
              <TextInput
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
          ) : null}

          <Field label={t('auth.password')} htmlFor="password">
            <TextInput
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              required
              invalid={Boolean(error)}
            />
          </Field>

          {error ? (
            <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" size="lg" loading={busy} className="w-full">
            {isSignUp ? t('auth.signUp') : t('auth.signIn')}
          </Button>
        </form>

        {isSignUp ? (
          <p className="mt-4 rounded-xl bg-paper-sunken px-3.5 py-2.5 text-xs leading-relaxed text-ink-muted">
            {t('auth.firstAccountAdmin')}
          </p>
        ) : null}

        <p className="mt-6 text-center text-sm text-ink-muted">
          {isSignUp ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
          <Link
            to={isSignUp ? '/signin' : '/signup'}
            className="font-medium text-accent-ink underline underline-offset-4"
          >
            {isSignUp ? t('auth.signIn') : t('auth.signUp')}
          </Link>
        </p>
      </div>
    </div>
  )
}
