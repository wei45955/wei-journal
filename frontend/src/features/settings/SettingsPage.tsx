import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { useResource } from '../../lib/cache'
import { cn } from '../../lib/cn'
import {
  AUTO_TIMEZONE,
  browserTimezone,
  dateTimePattern,
  displayTimezone,
  formatDate,
  formatDateTime,
  localDateKey,
  normalizeDateFormat,
  TIMEZONE_CHOICES,
} from '../../lib/format'
import type { AIStatus, Session, Settings } from '../../lib/types'
import { applyTheme } from '../../lib/theme'
import { setLanguage } from '../../i18n'
import { useAuth } from '../../state/auth'
import { useToast } from '../../state/toast'
import { BackButton, PageTitle, TopBar } from '../../shell/TopBar'
import { Button, Segmented, Switch, TextInput } from '../../ui'
import { ConfirmSheet, Sheet } from '../../ui/Sheet'
import { SignOutIcon } from '../../ui/icons'
import { FolderManager, TagManager } from './Managers'
import { Group, Row, selectClass } from './parts'

const DATE_FORMATS = ['PPP', 'yyyy-MM-dd', 'd MMMM yyyy', 'MM/dd/yyyy', 'dd/MM/yyyy']
const SIZES = [1280, 2048, 3072, 0]

function deviceName(agent: string): string {
  const lower = (agent || '').toLowerCase()
  const browser = lower.includes('edg/')
    ? 'Edge'
    : lower.includes('firefox')
      ? 'Firefox'
      : lower.includes('chrome') || lower.includes('crios')
        ? 'Chrome'
        : lower.includes('safari')
          ? 'Safari'
          : 'Browser'
  const platform = lower.includes('iphone')
    ? 'iPhone'
    : lower.includes('ipad')
      ? 'iPad'
      : lower.includes('android')
        ? 'Android'
        : lower.includes('mac os')
          ? 'Mac'
          : lower.includes('windows')
            ? 'Windows'
            : lower.includes('linux')
              ? 'Linux'
              : ''
  return platform ? `${platform}, ${browser}` : browser
}

export function SettingsPage() {
  const { t } = useTranslation()
  const { user, setSettings, signOut } = useAuth()
  const { notify, describe } = useToast()
  const location = useLocation()
  const settings = user?.settings
  const language = settings?.language === 'zh-CN' ? 'zh-CN' : 'en'

  const ai = useResource<AIStatus>('ai:status', () => api.aiStatus())
  const sessions = useResource<Session[]>('sessions', async () => (await api.sessions()).items)

  const [tiles, setTiles] = useState(settings?.mapTileUrl ?? '')
  const [quality, setQuality] = useState(settings?.imageQuality ?? 80)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [revoking, setRevoking] = useState<Session | null>(null)
  const [exporting, setExporting] = useState(false)
  const [withMedia, setWithMedia] = useState(false)

  useEffect(() => setTiles(settings?.mapTileUrl ?? ''), [settings?.mapTileUrl])
  useEffect(() => setQuality(settings?.imageQuality ?? 80), [settings?.imageQuality])

  useEffect(() => {
    if (!location.hash) return
    const target = document.getElementById(location.hash.slice(1))
    target?.scrollIntoView({ block: 'start' })
  }, [location.hash])

  const formats = useMemo(
    () => DATE_FORMATS.map((pattern) => ({ value: pattern, label: formatDate(new Date().toISOString(), language, pattern) })),
    [language],
  )

  if (!user || !settings) return null

  async function save(patch: Partial<Settings> & { alignZone?: string }) {
    try {
      const updated = await api.updateSettings(patch)
      setSettings(updated)
      if (patch.theme && (updated.theme === 'light' || updated.theme === 'dark' || updated.theme === 'system')) applyTheme(updated.theme)
      if (patch.language && (updated.language === 'en' || updated.language === 'zh-CN')) setLanguage(updated.language)
    } catch (error) {
      notify(describe(error), 'error')
    }
  }

  async function exportAll() {
    setExporting(true)
    try {
      const data = await api.exportJournal(withMedia)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `wei-journal-${localDateKey(new Date())}.json`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify(t('settings.exported'))
    } catch (error) {
      notify(describe(error), 'error')
    } finally {
      setExporting(false)
    }
  }

  const zoneValue = settings.timezone || AUTO_TIMEZONE
  const zones = TIMEZONE_CHOICES.some((zone) => zone.value === zoneValue) || zoneValue === AUTO_TIMEZONE
    ? TIMEZONE_CHOICES
    : [...TIMEZONE_CHOICES, { value: zoneValue, zh: zoneValue, en: zoneValue }]

  const aiNote = !ai.data
    ? t('settings.aiHint')
    : !ai.data.configured
      ? t('settings.aiNotConfigured')
      : !ai.data.enabled
        ? t('settings.aiServerOff')
        : settings.aiEnabled && ai.data.model
          ? `${t('settings.aiHint')} ${t('settings.aiReady', { model: ai.data.model })}`
          : t('settings.aiHint')

  return (
    <>
      <TopBar title={t('settings.title')} leading={<BackButton />} />
      <PageTitle>{t('settings.title')}</PageTitle>

      <div className="flex flex-col gap-8">
        <Group title={t('settings.account')}>
          <div className="flex items-center gap-3.5 px-4 py-3.5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent font-serif text-[1.375rem] text-accent-on uppercase">
              {user.username.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[1.0625rem] font-medium text-ink">{user.username}</p>
              <p className="truncate text-[0.8125rem] text-ink-3">
                {user.role === 'admin' ? t('settings.admin') : t('settings.member')}
              </p>
              <p className="truncate text-[0.8125rem] text-ink-3">
                {t('settings.joined', { date: formatDate(user.createdAt, language, normalizeDateFormat(settings.dateFormat)) })}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => void signOut()} className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[1rem] text-danger active:bg-well">
            <SignOutIcon size={20} />
            {t('settings.signOut')}
          </button>
        </Group>

        <Group title={t('settings.appearance')}>
          <Row label={t('settings.theme')} stacked>
            <Segmented
              label={t('settings.theme')}
              value={(settings.theme as 'system' | 'light' | 'dark') || 'system'}
              onChange={(theme) => {
                applyTheme(theme)
                void save({ theme })
              }}
              options={[
                { value: 'system', label: t('settings.themeSystem') },
                { value: 'light', label: t('settings.themeLight') },
                { value: 'dark', label: t('settings.themeDark') },
              ]}
            />
          </Row>
          <Row label={t('settings.language')} stacked>
            <Segmented
              label={t('settings.language')}
              value={language}
              onChange={(value) => {
                setLanguage(value)
                void save({ language: value })
              }}
              options={[
                { value: 'en', label: 'English' },
                { value: 'zh-CN', label: '简体中文' },
              ]}
            />
          </Row>
          <Row label={t('settings.dateFormat')} htmlFor="date-format">
            <select id="date-format" className={selectClass} value={normalizeDateFormat(settings.dateFormat)} onChange={(event) => void save({ dateFormat: event.target.value })}>
              {formats.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Row>
          <Row label={t('settings.timezone')} hint={t('settings.timezoneHint')} htmlFor="time-zone">
            <select
              id="time-zone"
              className={selectClass}
              value={zoneValue}
              onChange={(event) => {
                const value = event.target.value
                void save({ timezone: value, alignZone: value === AUTO_TIMEZONE ? browserTimezone() : value })
              }}
            >
              <option value={AUTO_TIMEZONE}>{t('settings.timezoneAuto', { zone: displayTimezone(AUTO_TIMEZONE) })}</option>
              {zones.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {language === 'zh-CN' ? zone.zh : zone.en}
                </option>
              ))}
            </select>
          </Row>
        </Group>

        <FolderManager />
        <TagManager />

        <Group title={t('settings.photos')}>
          <Row label={t('settings.compress')} hint={t('settings.compressHint')}>
            <Switch label={t('settings.compress')} checked={settings.compressImages} onChange={(compressImages) => void save({ compressImages })} />
          </Row>
          {settings.compressImages ? (
            <>
              <Row label={t('settings.quality')} stacked htmlFor="quality">
                <div className="flex items-center gap-3">
                  <input
                    id="quality"
                    type="range"
                    min={30}
                    max={95}
                    step={5}
                    value={quality}
                    onChange={(event) => setQuality(Number(event.target.value))}
                    onPointerUp={() => quality !== settings.imageQuality && void save({ imageQuality: quality })}
                    onKeyUp={() => quality !== settings.imageQuality && void save({ imageQuality: quality })}
                    className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--wj-accent)]"
                  />
                  <span className="tnum w-8 text-right text-[0.9375rem] text-ink-2">{quality}</span>
                </div>
              </Row>
              <Row label={t('settings.maxSize')} htmlFor="max-size">
                <select id="max-size" className={selectClass} value={settings.imageMaxDimension} onChange={(event) => void save({ imageMaxDimension: Number(event.target.value) })}>
                  {SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size === 0 ? t('settings.original') : t('settings.pixels', { size })}
                    </option>
                  ))}
                </select>
              </Row>
            </>
          ) : null}
        </Group>

        <Group title={t('settings.ai')} footer={aiNote}>
          <Row label={t('settings.aiToggle')}>
            <Switch
              label={t('settings.aiToggle')}
              checked={settings.aiEnabled}
              disabled={ai.data ? !ai.data.configured || !ai.data.enabled : false}
              onChange={(aiEnabled) => void save({ aiEnabled })}
            />
          </Row>
        </Group>

        <Group title={t('settings.map')} footer={t('settings.tilesHint')}>
          <div className="p-3">
            <TextInput
              value={tiles}
              inputMode="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              aria-label={t('settings.tiles')}
              onChange={(event) => setTiles(event.target.value)}
              onBlur={() => tiles.trim() !== (settings.mapTileUrl ?? '') && void save({ mapTileUrl: tiles.trim() })}
              className="text-[0.9375rem]"
            />
          </div>
        </Group>

        <Group title={t('settings.security')}>
          <button type="button" onClick={() => setPasswordOpen(true)} className="flex min-h-[52px] w-full items-center px-4 text-left text-[1rem] text-accent active:bg-well">
            {t('settings.changePassword')}
          </button>
        </Group>

        <Group title={t('settings.devices')}>
          {(sessions.data ?? []).length === 0 ? (
            <p className="px-4 py-4 text-[0.9375rem] text-ink-3">{sessions.loading ? t('common.loading') : t('settings.noDevices')}</p>
          ) : (
            (sessions.data ?? []).map((session) => (
              <div key={session.id} className="flex min-h-[60px] items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[1rem] text-ink">{deviceName(session.userAgent)}</p>
                  <p className={cn('truncate text-[0.8125rem]', session.current ? 'text-accent' : 'text-ink-3')}>
                    {session.current
                      ? t('settings.thisDevice')
                      : t('settings.lastActive', { date: formatDateTime(session.lastSeenAt, language, dateTimePattern(settings.dateFormat)) })}
                  </p>
                </div>
                {!session.current ? (
                  <Button size="sm" tone="secondary" onClick={() => setRevoking(session)}>
                    {t('settings.signOutDevice')}
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </Group>

        <Group title={t('settings.data')} footer={t('settings.exportHint')}>
          <Row label={t('settings.includeMedia')}>
            <Switch label={t('settings.includeMedia')} checked={withMedia} onChange={setWithMedia} />
          </Row>
          <button
            type="button"
            disabled={exporting}
            onClick={() => void exportAll()}
            className="flex min-h-[52px] w-full items-center px-4 text-left text-[1rem] text-accent active:bg-well disabled:opacity-50"
          >
            {exporting ? t('settings.exporting') : t('settings.export')}
          </button>
        </Group>
      </div>

      <PasswordSheet open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <ConfirmSheet
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={t('settings.signOutDeviceTitle')}
        body={t('settings.signOutDeviceBody')}
        confirmLabel={t('settings.signOutDevice')}
        destructive
        onConfirm={async () => {
          if (!revoking) return
          try {
            await api.revokeSession(revoking.id)
            notify(t('settings.deviceSignedOut'))
            void sessions.reload()
          } catch (error) {
            notify(describe(error), 'error')
          } finally {
            setRevoking(null)
          }
        }}
      />
    </>
  )
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { notify, describe } = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) return
    setCurrent('')
    setNext('')
    setRepeat('')
    setError('')
  }, [open])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (next.length < 8) return setError(t('settings.passwordShort'))
    if (next !== repeat) return setError(t('settings.passwordMismatch'))
    setError('')
    setBusy(true)
    try {
      await api.changePassword(current, next)
      notify(t('settings.passwordChanged'))
      onClose()
    } catch (reason) {
      setError(describe(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('settings.changePassword')} width="sm">
      <form onSubmit={submit} className="flex flex-col gap-3 pt-1 pb-2" noValidate>
        <TextInput type="password" autoComplete="current-password" placeholder={t('settings.currentPassword')} aria-label={t('settings.currentPassword')} value={current} onChange={(event) => setCurrent(event.target.value)} />
        <TextInput type="password" autoComplete="new-password" placeholder={t('settings.newPassword')} aria-label={t('settings.newPassword')} value={next} onChange={(event) => setNext(event.target.value)} />
        <TextInput type="password" autoComplete="new-password" placeholder={t('settings.repeatPassword')} aria-label={t('settings.repeatPassword')} value={repeat} invalid={Boolean(error)} onChange={(event) => setRepeat(event.target.value)} />
        {error ? (
          <p role="alert" className="text-[0.875rem] text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" tone="primary" size="lg" block loading={busy} disabled={!current || !next}>
          {t('settings.changePassword')}
        </Button>
      </form>
    </Sheet>
  )
}
