import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { useBack } from '../hooks/useBack'
import { applyTheme } from '../lib/theme'
import { setLanguage, type LanguageCode } from '../i18n'
import { Button, Field, TextInput, Toggle } from '../components/ui'
import {
  AUTO_TIMEZONE,
  browserTimezone,
  displayTimezone,
  formatDate,
  localDateKey,
  normalizeDateFormat,
  TIMEZONE_CHOICES,
} from '../lib/format'
import type { AIStatus, Session, Settings } from '../lib/types'
import { SettingsSection } from '../components/settings/SettingsSection'
import { SessionList } from '../components/settings/SessionList'
import { ChangePasswordForm } from '../components/settings/ChangePasswordForm'
import { BackButton, TopBar } from '../components/layout/TopBar'

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

/** The longest side a compressed picture may have. Zero keeps the original. */
const IMAGE_SIZES = [1280, 2048, 3072, 0]

/**
 * The settings of the account: how it looks, what it may send away, who is
 * signed in and how the data leaves the server.
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { notify, describe } = useToast()
  const { user, updateUser, signOut } = useAuth()
  const back = useBack('/')

  const language = user?.settings.language ?? i18n.resolvedLanguage ?? 'en'
  const settings = user?.settings

  const [saving, setSaving] = useState('')
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionBusy, setSessionBusy] = useState(false)
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [includeMedia, setIncludeMedia] = useState(true)

  const [tileUrlDraft, setTileUrlDraft] = useState(settings?.mapTileUrl ?? '')
  const [qualityDraft, setQualityDraft] = useState(settings?.imageQuality ?? 80)

  useEffect(() => {
    setTileUrlDraft(settings?.mapTileUrl ?? '')
  }, [settings?.mapTileUrl])

  useEffect(() => {
    setQualityDraft(settings?.imageQuality ?? 80)
  }, [settings?.imageQuality])

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
        sample: formatDate(new Date().toISOString(), language, normalizeDateFormat(format_.value)),
      })),
    [language],
  )

  const timezoneValue = !settings?.timezone ? AUTO_TIMEZONE : settings.timezone
  const timezoneOptions = TIMEZONE_CHOICES.some((zone) => zone.value === timezoneValue)
    ? TIMEZONE_CHOICES
    : [...TIMEZONE_CHOICES, { value: timezoneValue, zh: timezoneValue, en: timezoneValue }]

  async function saveSettings(patch: Partial<Settings> & { alignZone?: string }, key: string) {
    setSaving(key)
    try {
      const updated = await api.updateSettings(patch)
      if (user) updateUser({ ...user, settings: updated })
      if (updated.theme === 'system' || updated.theme === 'light' || updated.theme === 'dark') {
        applyTheme(updated.theme)
      }
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

  function commitQuality() {
    if (!settings) return
    if (qualityDraft === settings.imageQuality) return
    void saveSettings({ imageQuality: qualityDraft }, 'imageQuality')
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
    <div className="animate-page-in flex flex-col gap-4 pb-8">
      <TopBar
        title={t('settings.title')}
        left={<BackButton label={t('nav.back')} onClick={back} />}
      />

      <header className="pt-2">
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
              {formatDate(user.createdAt, language, normalizeDateFormat(settings.dateFormat))}
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
                className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
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
                  className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border px-4 py-1.5 text-sm transition-colors disabled:opacity-60 ${
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
            value={normalizeDateFormat(settings.dateFormat)}
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
          <select
            id="settings-timezone"
            className="w-full cursor-pointer rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            value={timezoneValue}
            onChange={(event) => {
              const value = event.target.value
              void saveSettings(
                { timezone: value, alignZone: value === AUTO_TIMEZONE ? browserTimezone() : value },
                'timezone',
              )
            }}
            disabled={saving === 'timezone'}
          >
            <option value={AUTO_TIMEZONE}>
              {t('settings.timezoneAuto', { zone: displayTimezone(AUTO_TIMEZONE) })}
            </option>
            {timezoneOptions.map((zone) => (
              <option key={zone.value} value={zone.value}>
                {language.startsWith('zh') ? zone.zh : zone.en}
              </option>
            ))}
          </select>
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

      <SettingsSection
        title={t('settings.sections.photos')}
        description={t('settings.photosHint')}
      >
        <Toggle
          id="settings-compress-images"
          checked={settings.compressImages}
          onChange={(value) => void saveSettings({ compressImages: value }, 'compressImages')}
          label={t('settings.compressImages')}
          description={t('settings.compressImagesHint')}
          disabled={saving === 'compressImages'}
        />

        {settings.compressImages ? (
          <>
            <Field
              label={t('settings.imageQuality')}
              htmlFor="settings-image-quality"
              hint={t('settings.imageQualityHint')}
            >
              <div className="flex items-center gap-3">
                <input
                  id="settings-image-quality"
                  type="range"
                  min={30}
                  max={95}
                  step={5}
                  value={qualityDraft}
                  onChange={(event) => setQualityDraft(Number(event.target.value))}
                  onPointerUp={commitQuality}
                  onKeyUp={commitQuality}
                  onBlur={commitQuality}
                  className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-paper-sunken accent-[var(--accent)]"
                />
                <span className="w-9 text-right text-[0.9375rem] font-semibold text-ink tabular-nums">
                  {qualityDraft}
                </span>
              </div>
            </Field>

            <Field
              label={t('settings.imageSize')}
              htmlFor="settings-image-size"
              hint={t('settings.imageSizeHint')}
            >
              <select
                id="settings-image-size"
                className="w-full cursor-pointer rounded-xl border border-line bg-paper-raised px-3.5 py-2.5 text-[0.9375rem] text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                value={settings.imageMaxDimension}
                onChange={(event) =>
                  void saveSettings(
                    { imageMaxDimension: Number(event.target.value) },
                    'imageMaxDimension',
                  )
                }
                disabled={saving === 'imageMaxDimension'}
              >
                {IMAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size === 0
                      ? t('settings.imageSizeOriginal')
                      : t('settings.imageSizeOption', { size })}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
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
            dateFormat={settings.dateFormat}
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
