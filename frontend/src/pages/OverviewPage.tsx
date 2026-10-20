import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { useFolders } from '../hooks/useFolders'
import { ErrorState, Skeleton } from '../components/ui'
import { NewFolderForm } from '../components/entries/NewFolderForm'
import { IconButton, TopBar } from '../components/layout/TopBar'
import { NewEntryButton } from '../components/layout/AppShell'
import {
  ChartIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TimelineIcon,
} from '../components/icons'
import type { Stats } from '../lib/types'

/**
 * The page above the timeline.
 *
 * It holds the things that are not written every day: the folders, the
 * numbers of the archive and the way to the settings.
 */
export function OverviewPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { describe } = useToast()
  const { folders } = useFolders()
  const navigate = useNavigate()

  const [stats, setStats] = useState<Stats | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [foldersOpen, setFoldersOpen] = useState(false)
  const [addingFolder, setAddingFolder] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const summary = await api.stats()
        if (!cancelled) {
          setStats(summary)
          setStatus('ready')
        }
      } catch (err) {
        if (!cancelled) {
          setError(describe(err, t('errors.generic')))
          setStatus('error')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [describe, t])

  const streak = stats?.currentStreak ?? 0
  const year = stats?.currentYear ?? new Date().getFullYear()

  const hour = useMemo(() => {
    const now = new Date()
    return now.getHours()
  }, [])

  const greeting =
    hour < 5 ? t('overview.night') : hour < 12 ? t('overview.morning') : hour < 18 ? t('overview.afternoon') : t('overview.evening')

  return (
    <div className="animate-page-in pb-24">
      <TopBar
        title={t('app.name')}
        actions={
          <>
            <IconButton label={t('nav.search')} onClick={() => navigate('/search')}>
              <SearchIcon size={20} />
            </IconButton>
            <IconButton label={t('nav.settings')} onClick={() => navigate('/settings')}>
              <SettingsIcon size={20} />
            </IconButton>
          </>
        }
      />

      <header className="pt-4 pb-5">
        <p className="text-[0.9375rem] text-ink-muted">{greeting}</p>
        <h1 className="title-large mt-1 text-ink-strong">{user?.username ?? t('app.name')}</h1>
      </header>

      {status === 'loading' ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      ) : status === 'error' ? (
        <ErrorState message={error} onRetry={() => navigate(0)} />
      ) : (
        <>
          {/* --- the numbers of the archive --- */}
          <button
            type="button"
            onClick={() => navigate('/insights')}
            className="card flex w-full items-stretch gap-1 p-4 text-left transition-shadow duration-200 hover:shadow-md active:scale-[0.995]"
          >
            <Number
              value={streak}
              unit={streak === 1 ? t('stats.oneDay') : t('stats.days')}
              label={t('overview.streak')}
            />
            <span className="my-1 w-px bg-line" aria-hidden="true" />
            <Number
              value={stats?.totalEntries ?? 0}
              unit={t('overview.inTotal')}
              label={t('stats.totalEntries')}
            />
            <span className="my-1 w-px bg-line" aria-hidden="true" />
            <Number value={stats?.entriesThisYear ?? 0} unit={String(year)} label={t('overview.thisYear')} />
            <span className="flex w-8 shrink-0 items-center justify-end text-ink-faint">
              <ChevronRightIcon size={18} />
            </span>
          </button>

          {/* --- the folders --- */}
          <section className="mt-5">
            <button
              type="button"
              onClick={() => setFoldersOpen((value) => !value)}
              aria-expanded={foldersOpen}
              className="flex w-full items-center gap-3 rounded-2xl bg-paper-raised px-4 py-3.5 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-colors active:bg-paper-sunken"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <FolderIcon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold text-ink-strong">
                  {t('nav.folders')}
                </span>
                <span className="block truncate text-xs text-ink-faint">
                  {folders.length === 0
                    ? t('folders.empty')
                    : folders.length === 1
                      ? t('folders.oneEntry')
                      : t('folders.entries', { count: folders.length })}
                </span>
              </span>
              <span className="text-ink-faint">
                {foldersOpen ? <ChevronDownIcon size={18} /> : <ChevronRightIcon size={18} />}
              </span>
            </button>

            {foldersOpen ? (
              <div className="card mt-2 overflow-hidden animate-sheet-up">
                {folders.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-ink-muted">{t('folders.emptyBody')}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {folders.map((folder) => (
                      <li key={folder.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/folders/${folder.id}`)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-paper-sunken"
                        >
                          <FolderIcon size={18} className="shrink-0 text-ink-muted" />
                          <span className="min-w-0 flex-1 truncate text-[0.9375rem] text-ink">
                            {folder.name}
                          </span>
                          <span className="text-xs text-ink-faint tabular-nums">
                            {folder.entryCount}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {addingFolder ? (
                  <div className="px-4 py-3">
                    <NewFolderForm
                      onCreated={async (folder) => {
                        setAddingFolder(false)
                        navigate(`/folders/${folder.id}`)
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingFolder(true)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-[0.9375rem] font-medium text-accent transition-colors active:bg-paper-sunken"
                  >
                    <PlusIcon size={18} />
                    {t('folders.new')}
                  </button>
                )}
              </div>
            ) : null}
          </section>

          {/* --- the way to the rest --- */}
          <section className="mt-5 overflow-hidden rounded-2xl bg-paper-raised shadow-[0_1px_2px_rgb(0_0_0/0.04)]">
            <LinkRow
              icon={<TimelineIcon size={19} />}
              label={t('nav.timeline')}
              onClick={() => navigate('/')}
            />
            <LinkRow
              icon={<ChartIcon size={19} />}
              label={t('stats.title')}
              onClick={() => navigate('/insights')}
            />
            <LinkRow
              icon={<SearchIcon size={19} />}
              label={t('nav.search')}
              onClick={() => navigate('/search')}
            />
            <LinkRow
              icon={<SettingsIcon size={19} />}
              label={t('nav.settings')}
              onClick={() => navigate('/settings')}
              last
            />
          </section>
        </>
      )}

      <NewEntryButton />
    </div>
  )
}

/** One number of the archive. */
function Number({
  value,
  unit,
  label,
}: {
  value: number
  unit: string
  label: string
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[0.625rem] font-semibold tracking-wide text-ink-faint uppercase">
        {label}
      </span>
      <span className="mt-1 block font-display text-[1.75rem] leading-none font-bold tracking-tight text-ink-strong tabular-nums">
        {value}
      </span>
      <span className="mt-1 block truncate text-[0.6875rem] font-medium text-ink-faint">{unit}</span>
    </span>
  )
}

/** One row of the list of places. */
function LinkRow({
  icon,
  label,
  onClick,
  last = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  last?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-paper-sunken ${
        last ? '' : 'border-b border-line'
      }`}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-paper-sunken text-ink-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium text-ink">{label}</span>
      <ChevronRightIcon size={17} className="shrink-0 text-ink-faint" />
    </button>
  )
}
