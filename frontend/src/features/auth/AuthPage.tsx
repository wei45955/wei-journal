import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../lib/api'
import { dayParts, localDateKey } from '../../lib/format'
import { setLanguage } from '../../i18n'
import { useAuth } from '../../state/auth'
import { useToast } from '../../state/toast'
import { Button } from '../../ui'
import { InkUnderline, Seal } from '../../ui/Seal'
import { cn } from '../../lib/cn'

function safeReturn(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (value.startsWith('/signin') || value.startsWith('/signup')) return '/'
  return value
}

const fieldClass =
  'mt-1 block h-12 w-full border-0 border-b border-rule bg-transparent px-0 text-base text-ink ' +
  'placeholder:text-ink-3 transition-colors focus:border-accent focus-visible:outline-offset-4'

/**
 * The opening page of the journal: today's date, unopened, and the small
 * mark that says it belongs to you. Signing in opens the same page.
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

  const today = localDateKey(new Date())
  const parts = dayParts(today, language)
  const year = today.slice(0, 4)

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.08fr_0.92fr]">
      <section className="flex flex-col px-6 pt-[calc(env(safe-area-inset-top)+2rem)] pb-8 sm:pb-10 sm:px-10 lg:justify-between lg:px-16 lg:py-14">
        <div className="flex items-center gap-3">
          <Seal size={34}>记</Seal>
          <span className="wordmark text-ink">{t('app.name')}</span>
        </div>

        <div className="mt-10 lg:my-10">
          <div className="flex items-end gap-4 animate-rise">
            <span className="date-numeral text-ink">{parts.day}</span>
            <div className="flex flex-col gap-2 pb-1">
              <Seal size={44} stamp label={t('common.today')}>
                今
              </Seal>
              <div>
                <p className="title-3 text-ink">{parts.weekday}</p>
                <p className="caption tnum mt-0.5 text-ink-3">
                  {year} · {parts.month}
                </p>
              </div>
            </div>
          </div>

          <h1 className="display-2 mt-6 max-w-[13ch] text-ink sm:mt-8">{t('auth.tagline')}</h1>
          <div className="mt-3 w-44 text-seal" aria-hidden="true">
            <InkUnderline />
          </div>
          <p className="body-1 mt-4 max-w-sm text-ink-2">{t('auth.taglineLead')}</p>
        </div>

        <p className="caption hidden text-ink-3 lg:block">{t('app.name')}</p>
      </section>

      <section className="flex flex-col justify-center border-t border-rule bg-leaf px-6 py-8 sm:px-10 sm:py-10 lg:border-t-0 lg:border-l lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="heading-2 text-ink">{signingUp ? t('auth.signUpTitle') : t('auth.signInTitle')}</h2>
              <p className="body-2 mt-2 text-ink-2">{signingUp ? t('auth.signUpLead') : t('auth.signInLead')}</p>
            </div>
            <button
              type="button"
              onClick={() => setLanguage(language === 'zh-CN' ? 'en' : 'zh-CN')}
              className="press -mr-2 h-9 shrink-0 rounded-lg px-2 text-sm text-ink-3 hover:bg-well hover:text-ink"
            >
              {language === 'zh-CN' ? 'English' : '中文'}
            </button>
          </div>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-5 sm:mt-8" noValidate>
            <div>
              <label htmlFor="auth-username" className="title-3 text-ink-2">
                {t('auth.username')}
              </label>
              <input
                id="auth-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                aria-invalid={Boolean(error) || undefined}
                onChange={(event) => setUsername(event.target.value)}
                className={cn(fieldClass, error && 'border-danger')}
              />
            </div>

            {signingUp ? (
              <div>
                <label htmlFor="auth-email" className="title-3 text-ink-2">
                  {t('auth.email')}
                </label>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                    value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={fieldClass}
                />
              </div>
            ) : null}

            <div>
              <label htmlFor="auth-password" className="title-3 text-ink-2">
                {t('auth.password')}
              </label>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={signingUp ? 'new-password' : 'current-password'}
                value={password}
                aria-invalid={Boolean(error) || undefined}
                onChange={(event) => setPassword(event.target.value)}
                className={cn(fieldClass, error && 'border-danger')}
              />
            </div>

            {error ? (
              <p role="alert" className="body-2 text-danger animate-fade">
                {error}
              </p>
            ) : null}

            <Button type="submit" tone="primary" size="lg" block loading={busy} className="mt-1">
              {signingUp ? t('auth.signUp') : t('auth.signIn')}
            </Button>
          </form>

          {signingUp ? <p className="caption mt-4 text-ink-3">{t('auth.firstAdmin')}</p> : null}

          <p className="body-2 mt-8 text-ink-2">
            {signingUp ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
            <Link
              to={signingUp ? '/signin' : '/signup'}
              state={location.state}
              replace
              className="font-medium text-accent underline decoration-1 underline-offset-4"
            >
              {signingUp ? t('auth.toSignIn') : t('auth.toSignUp')}
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
