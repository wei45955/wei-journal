import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { api } from '../lib/api'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { setLanguage, type LanguageCode } from '../i18n'
import { Button, Field, TextInput, Toggle } from '../components/ui'
import { COMMON_TIMEZONES, formatDate, localeFor, localDateKey } from '../lib/format'
import type { AIStatus, Session, Settings } from '../lib/types'
import { SettingsSection } from '../components/settings/SettingsSection'
import { SessionList } from '../components/settings/SessionList'
import { ChangePasswordForm } from '../components/settings/ChangePasswordForm'

const THEMES = [
  { value: 'system', key: 'settings.themeSystem', fallback: 'Follow the system' },
  { value: 'light', key: 'settings.themeLight', fallback: 'Light' },
  { value: 'dark', key: 'settings.themeDark', fallback: 'Dark' },
]

const DATE_FORMATS = [
  { value: 'PPP', sample: 'PPP' },
  { value: 'yyyy-MM-dd', sample: 'yyyy-MM-dd' },
  { value: 'd MMMM yyyy', sample: 'd MMMM yyyy' },
  { value: 'MM/dd/yyyy', sample: 'MM/dd/yyyy' },
  { value: 'dd/MM/yyyy', sample: 'dd/MM/yyyy' },
]

/** The theme is applied to the document, the way the sign in does it. */
function applyTheme(theme: string) {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme')
  else if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

/**
 * The settings of the account: how it looks, what it may send away, who is
 * signed in and how the data leaves the server.
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { notify, describe } = useToast()
  const { user, updateUser, signOut } = useAuth()

  const language = user?.settings.language ?? i18n.resolvedLanguage ?? 'en'
  const locale = localeFor(language)
  const settings = user?.settings

  const [saving, setSaving] = useState('')
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionBusy, setSessionBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [includeMedia, setIncludeMedia] = useState(true)

  const [timezoneDraft, setTimezoneDraft] = useState(settings?.timezone ?? '')
  const [tileUrlDraft, setTileUrlDraft] = useState(settings?.mapTileUrl ?? '')

  useEffect(() => {
    setTimezoneDraft(settings?.timezone ?? '')
    setTileUrlDraft(settings?.mapTileUrl ?? '')
  }, [settings?.timezone, settings?.mapTileUrl])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const status = await api.aiStatus()
        if (!cancelled) setAiStatus(status)
      } catch {
        if (!cancelled) setAiStatus(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const page = await api.sessions()
        if (!cancelled) setSessions(page.items)
      } catch {
        if (!cancelled) setSessions([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const dateFormatSamples = useMemo(
    () =>
      DATE_FORMATS.map((format_) => ({
        value: format_.value,
        sample:
          format_.value === 'yyyy-MM-dd'
            ? format(new Date(), 'yyyy-MM-dd')
            : format_.value === 'MM/dd/yyyy'
              ? format(new Date(), 'MM/dd/yyyy')
              : format_.value === 'dd/MM/yyyy'
                ? format(new Date(), 'dd/MM/yyyy')
                : format(new Date(), format_.value, { locale }),
      })),
    [locale],
  )

  async function saveSettings(patch: Partial<Settings>, key: string) {
    setSaving(key)
    try {
      const updated = await api.updateSettings(patch)
      if (user) updateUser({ ...user, settings: updated })
      if (updated.theme) applyTheme(updated.theme)
      if (updated.language === 'en' || updated.language === 'zh-CN') {
        setLanguage(updated.language as LanguageCode)
      }
      notify(t('settings.saved', 'Saved'), 'success')
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
    } finally {
      setSaving('')
    }
  }

  async function revokeSession(id: number) {
    setSessionBusy(true)
    try {
      await api.revokeSession(id)
      setSessions((current) => current.filter((session) => session.id !== id))
      notify(t('settings.sessionRevoked', 'The device was signed out.'), 'success')
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
    } finally {
      setSessionBusy(false)
    }
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    setPasswordBusy(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      notify(t('settings.passwordChanged'), 'success')
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
    } finally {
      setPasswordBusy(false)
    }
  }

  async function exportJournal() {
    setExporting(true)
    try {
      const data = await api.exportJournal(includeMedia)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `wei-journal-${localDateKey(new Date())}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      notify(t('settings.exported', 'The export was downloaded.'), 'success')
    } catch (err) {
      notify(describe(err, t('errors.generic')), 'error')
    } finally {
      setExporting(false)
    }
  }

  if (!user || !settings) {
    return (
      <div className="pb-8">
        <h1 className="title-large text-ink-strong">{t('settings.title')}</h1>
        <p className="mt-2 text-sm text-ink-muted">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <header>
        <h1 className="title-large text-ink-strong">{t('settings.title')}</h1>
      </header>

      <SettingsSection title={t('settings.sections.account')}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs tracking-wide text-ink-faint uppercase">
              {t('auth.username', 'Username')}
            </dt>
            <dd className="mt-0.5 text-[0.9375rem] text-ink-strong">{user.username}</dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-ink-faint uppercase">
              {t('auth.email', 'Email')}
            </dt>
            <dd className="mt-0.5 text-[0.9375rem] text-ink-strong">
              {user.email || t('common.none')}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-ink-faint uppercase">
              {t('settings.role')}
            </dt>
            <dd className="mt-0.5 text-[0.9375rem] text-ink-strong">
              {user.role === 'admin' ? t('settings.admin') : t('settings.user')}
            </dd>
          </div>
          <div>
            <dt className="text-xs tracking-wide text-ink-faint uppercase">
              {t('settings.memberSince')}
            </dt>
            <dd className="mt-0.5 text-[0.9375rem] text-ink-strong">
              {formatDate(user.createdAt, language)}
            </dd>
          </div>
        </dl>

        <div>
          <Button variant="secondary" size="sm" onClick={() => void signOut()}>
            {t('common.signOut', 'Sign out')}
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.sections.language')} description={t('settings.languageHint')}>
        <div className="flex flex-wrap gap-2">
          {(['en', 'zh-CN'] as const).map((code) => {
            const active = settings.language === code
            return (
              <button
                key={code}
                type="button"
                onClick={() => void saveSettings({ language: code }, 'language')}
                disabled={saving === 'language'}
                aria-pressed={active}
                className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                  active
                    ? 'border-accent bg-accent text-accent-contrast'
                    : 'border-line bg-paper-raised text-ink-muted hover:border-line-strong hover:text-ink-strong'
                }`}
              >
                {code === 'en' ? t('settings.english') : t('settings.chinese')}
              </button>
            )
          })}
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.sections.appearance')}>
        <div>
          <p className="mb-1.5 text-sm text-ink-strong">{t('settings.theme')}</p>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((theme) => {
              const active = settings.theme === theme.value
              return (
                <button
                  key={theme.value}
                  type="button"
                  onClick={() => void saveSettings({ theme: theme.value }, 'theme')}
                  disabled={saving === 'theme'}
                  aria-pressed={active}
                  className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors disabled:opacity-60 ${
                    active
                      ? 'border-accent bg-accent text-accent-contrast'
                      : 'border-line bg-paper-raised text-ink-muted hover:border-line-strong hover:text-ink-strong'
                  }`}
                >
                  {t(theme.key, theme.fallback)}
                </button>
              )
            })}
          </div>
        </div>

        <Field label={t('settings.dateFormat')} htmlFor="settings-date-format">
          <select
            id="settings-date-format"
            className="w-full cursor-pointer rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            value={settings.dateFormat || 'PPP'}
            onChange={(event) => void saveSettings({ dateFormat: event.target.value }, 'dateFormat')}
            disabled={saving === 'dateFormat'}
          >
            {dateFormatSamples.map((option) => (
              <option key={option.value} value={option.value}>
                {option.sample}
              </option>
            ))}
          </select>
        </Field>

        <Field label={t('settings.timezone')} hint={t('settings.timezoneHint')} htmlFor="settings-timezone">
          <TextInput
            id="settings-timezone"
            list="settings-timezone-list"
            value={timezoneDraft}
            onChange={(event) => setTimezoneDraft(event.target.value)}
            onBlur={() => {
              const value = timezoneDraft.trim()
              if (value !== (settings.timezone ?? '')) {
                void saveSettings({ timezone: value }, 'timezone')
              }
            }}
          />
          <datalist id="settings-timezone-list">
            {COMMON_TIMEZONES.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </Field>

        <Field
          label={t('settings.mapTileUrl', 'Map tiles')}
          hint={t('settings.mapTileUrlHint', 'The address of the tile server. {z}, {x} and {y} are replaced.')}
          htmlFor="settings-tile-url"
        >
          <TextInput
            id="settings-tile-url"
            value={tileUrlDraft}
            placeholder="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            onChange={(event) => setTileUrlDraft(event.target.value)}
            onBlur={() => {
              const value = tileUrlDraft.trim()
              if (value !== (settings.mapTileUrl ?? '')) {
                void saveSettings({ mapTileUrl: value }, 'mapTileUrl')
              }
            }}
          />
        </Field>
      </SettingsSection>

      <SettingsSection title={t('settings.sections.privacy')}>
        <Toggle
          id="settings-ai-enabled"
          checked={settings.aiEnabled}
          onChange={(value) => void saveSettings({ aiEnabled: value }, 'aiEnabled')}
          label={t('settings.aiEnabled')}
          description={t('settings.aiEnabledHint')}
          disabled={saving === 'aiEnabled' || (aiStatus !== null && !aiStatus.configured)}
        />

        {aiStatus === null ? null : aiStatus.status === 'unavailable' ? (
          <p className="text-sm text-ink-muted">{t('settings.aiUnavailable')}</p>
        ) : aiStatus.status === 'disabled' ? (
          <p className="text-sm text-ink-muted">{t('entries.aiDisabled')}</p>
        ) : (
          <p className="text-sm text-ink-muted">
            {t('settings.aiReady', 'AI is ready.')}
            {aiStatus.model ? ` ${aiStatus.model}` : ''}
          </p>
        )}
      </SettingsSection>

      <SettingsSection title={t('settings.sections.security')}>
        <div>
          <h3 className="mb-2 text-sm font-medium text-ink">{t('settings.changePassword')}</h3>
          <ChangePasswordForm busy={passwordBusy} onSubmit={changePassword} />
        </div>

        <div>
          <h3 className="mb-1 text-sm font-medium text-ink">{t('settings.sessions')}</h3>
          <p className="mb-2 text-sm text-ink-muted">{t('settings.sessionsHint')}</p>
          <SessionList
            sessions={sessions}
            language={language}
            busy={sessionBusy}
            onRevoke={(id) => void revokeSession(id)}
          />
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.sections.data')} description={t('settings.exportHint')}>
        <Toggle
          id="settings-export-media"
          checked={includeMedia}
          onChange={setIncludeMedia}
          label={t('settings.exportMedia', 'Include the attachments')
          }
          description={t('settings.exportMediaHint', 'The files themselves stay on the server.')}
        />
        <div>
          <Button variant="secondary" loading={exporting} onClick={() => void exportJournal()}>
            {exporting ? t('settings.exporting') : t('settings.exportDownload')}
          </Button>
        </div>
      </SettingsSection>
    </div>
  )
}

export default SettingsPage
