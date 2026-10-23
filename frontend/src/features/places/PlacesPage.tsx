import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { useResource } from '../../lib/cache'
import { cn } from '../../lib/cn'
import { formatEventDate } from '../../lib/format'
import type { MapPlace } from '../../lib/types'
import { useAuth, usePrefs } from '../../state/auth'
import { useFolders, useTags } from '../../state/library'
import { useToast } from '../../state/toast'
import { PageTitle, TopBar } from '../../shell/TopBar'
import { Button, buttonClass, Chip, EmptyState, ErrorState, IconButton, inputClass, Skeleton } from '../../ui'
import { Sheet } from '../../ui/Sheet'
import { ChevronRightIcon, CloseIcon, FilterIcon, LocateIcon, PlaceIcon } from '../../ui/icons'
import { MapCanvas } from './MapCanvas'

const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

function creditFor(url: string): string {
  if (url === OSM) return OSM_CREDIT
  try {
    const host = new URL(url.replace(/\{[^}]*\}/g, '0')).host
    return host.replace(/[<>&"]/g, '')
  } catch {
    return ''
  }
}

interface PlaceFilters {
  folder: number | 'none' | ''
  tags: number[]
  from: string
  to: string
}
const NONE: PlaceFilters = { folder: '', tags: [], from: '', to: '' }

export function PlacesPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { language, dateFormat } = usePrefs()
  const { describe } = useToast()
  const [params] = useSearchParams()
  const focusEntry = Number(params.get('entry')) || null

  const [filters, setFilters] = useState<PlaceFilters>(NONE)
  const [filterOpen, setFilterOpen] = useState(false)
  const [selected, setSelected] = useState<MapPlace | null>(null)
  const [fitToken, setFitToken] = useState(0)
  const [tileError, setTileError] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  const key = `places:${filters.folder}:${filters.tags.join(',')}`
  const places = useResource<MapPlace[]>(key, async () =>
    (await api.locations({ folderId: filters.folder === '' ? undefined : filters.folder, tags: filters.tags })).items,
  )

  const visible = useMemo(
    () =>
      (places.data ?? []).filter((place) => {
        if (filters.from && (!place.date || place.date < filters.from)) return false
        if (filters.to && (!place.date || place.date > filters.to)) return false
        return true
      }),
    [places.data, filters.from, filters.to],
  )

  useEffect(() => {
    if (!focusEntry || !places.data) return
    const found = places.data.find((place) => place.entryId === focusEntry)
    if (found) setSelected(found)
  }, [focusEntry, places.data])

  const tileUrl = user?.settings.mapTileUrl?.trim() || OSM
  const filtered = filters.folder !== '' || filters.tags.length > 0 || Boolean(filters.from || filters.to)

  return (
    <>
      <TopBar
        title={t('map.title')}
        trailing={
          <IconButton label={t('map.filter')} active={filtered} onClick={() => setFilterOpen(true)}>
            <FilterIcon size={22} />
          </IconButton>
        }
      />
      <PageTitle sub={places.data ? t('map.count', { count: visible.length }) : null}>{t('map.title')}</PageTitle>

      {places.loading ? (
        <Skeleton className="-mx-5 h-[58dvh] rounded-none sm:mx-0 sm:rounded-[22px]" />
      ) : places.error && !places.data ? (
        <ErrorState message={describe(places.error)} onRetry={() => void places.reload()} />
      ) : (places.data ?? []).length === 0 && !filtered ? (
        <EmptyState art={<MapArt />} title={t('map.emptyTitle')} body={t('map.emptyBody')} />
      ) : (
        <>
          <div className="relative isolate -mx-5 h-[58dvh] min-h-[22rem] overflow-hidden bg-well sm:mx-0 sm:rounded-[22px]">
            {unavailable ? (
              <p className="flex size-full items-center justify-center px-8 text-center text-[0.9375rem] text-ink-2">{t('map.unavailable')}</p>
            ) : (
              <MapCanvas
                places={visible}
                tileUrl={tileUrl}
                attribution={creditFor(tileUrl)}
                focus={selected}
                onSelect={setSelected}
                onTileError={() => setTileError(true)}
                onUnavailable={() => setUnavailable(true)}
                fitToken={fitToken}
                label={t('map.title')}
              />
            )}
            <div className="absolute top-3 right-3 z-[500] flex flex-col overflow-hidden rounded-[14px] glass shadow-float">
              <button
                type="button"
                aria-label={t('map.fit')}
                title={t('map.fit')}
                onClick={() => {
                  setSelected(null)
                  setFitToken((value) => value + 1)
                }}
                className="press flex size-11 items-center justify-center text-ink"
              >
                <LocateIcon size={21} />
              </button>
            </div>
            {selected ? (
              <PlaceCard place={selected} language={language} dateFormat={dateFormat} onClose={() => setSelected(null)} />
            ) : null}
          </div>
          {tileError ? <p className="mt-2 text-[0.8125rem] text-ink-3">{t('map.tileError')}</p> : null}

          <ul className="mt-6 overflow-hidden rounded-[20px] bg-leaf">
            {visible.map((place, index) => (
              <li key={place.id} className={cn(index > 0 && 'border-t border-rule')}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(place)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-well"
                >
                  {place.thumbUrl ? (
                    <img src={place.thumbUrl} alt="" loading="lazy" className="size-11 shrink-0 rounded-[10px] bg-well object-cover" />
                  ) : (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
                      <PlaceIcon size={20} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[1rem] text-ink">{place.name || place.title || t('map.unnamed')}</span>
                    <span className="block truncate text-[0.8125rem] text-ink-3">
                      {place.date ? formatEventDate(place.date, language, dateFormat) : place.address}
                    </span>
                  </span>
                  {place.entryCount > 1 ? <span className="tnum text-[0.8125rem] text-ink-3">{place.entryCount}</span> : null}
                  <ChevronRightIcon size={18} className="shrink-0 text-ink-3" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <PlaceFilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} value={filters} onApply={setFilters} />
    </>
  )
}

function PlaceCard({ place, language, dateFormat, onClose }: { place: MapPlace; language: string; dateFormat?: string; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="absolute inset-x-3 bottom-3 z-[500] animate-rise">
      <div className="glass flex items-center gap-3 rounded-[18px] p-2.5 shadow-float">
        {place.thumbUrl ? (
          <img src={place.thumbUrl} alt="" className="size-14 shrink-0 rounded-[12px] bg-well object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
            <PlaceIcon size={24} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[1rem] font-medium text-ink">{place.name || place.title || t('map.unnamed')}</p>
          <p className="truncate text-[0.8125rem] text-ink-2">
            {place.entryCount > 1 ? t('map.here', { count: place.entryCount }) : place.date ? formatEventDate(place.date, language, dateFormat) : place.address}
          </p>
        </div>
        {place.entryId ? (
          <Link to={`/entry/${place.entryId}`} className={buttonClass('primary', 'sm')}>
            {t('map.open')}
          </Link>
        ) : null}
        <IconButton size="sm" label={t('common.close')} onClick={onClose} className="text-ink-2">
          <CloseIcon size={18} />
        </IconButton>
      </div>
    </div>
  )
}

function PlaceFilterSheet({
  open,
  onClose,
  value,
  onApply,
}: {
  open: boolean
  onClose: () => void
  value: PlaceFilters
  onApply: (next: PlaceFilters) => void
}) {
  const { t } = useTranslation()
  const { folders } = useFolders()
  const { tags } = useTags()
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('map.filter')}
      tall
      action={
        <button type="button" onClick={() => setDraft(NONE)} className="press -mr-2 h-10 rounded-full px-3 text-[0.9375rem] text-ink-2">
          {t('common.clear')}
        </button>
      }
      footer={
        <Button
          tone="primary"
          size="lg"
          block
          onClick={() => {
            onApply(draft)
            onClose()
          }}
        >
          {t('common.done')}
        </Button>
      }
    >
      <h3 className="mt-2 mb-3 text-[0.9375rem] font-semibold text-ink">{t('folder.title')}</h3>
      <div className="flex flex-wrap gap-2">
        <Chip selected={draft.folder === ''} onClick={() => setDraft({ ...draft, folder: '' })}>
          {t('map.anyFolder')}
        </Chip>
        <Chip selected={draft.folder === 'none'} onClick={() => setDraft({ ...draft, folder: 'none' })}>
          {t('timeline.unfiled')}
        </Chip>
        {folders.map((folder) => (
          <Chip key={folder.id} selected={draft.folder === folder.id} onClick={() => setDraft({ ...draft, folder: folder.id })}>
            {folder.name}
          </Chip>
        ))}
      </div>
      {tags.length > 0 ? (
        <>
          <h3 className="mt-7 mb-3 text-[0.9375rem] font-semibold text-ink">{t('filters.tags')}</h3>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Chip
                key={tag.id}
                selected={draft.tags.includes(tag.id)}
                onClick={() =>
                  setDraft({ ...draft, tags: draft.tags.includes(tag.id) ? draft.tags.filter((id) => id !== tag.id) : [...draft.tags, tag.id] })
                }
              >
                {tag.name}
              </Chip>
            ))}
          </div>
        </>
      ) : null}
      <h3 className="mt-7 mb-3 text-[0.9375rem] font-semibold text-ink">{t('filters.dates')}</h3>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[0.8125rem] text-ink-2">{t('filters.from')}</span>
          <input type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className={inputClass} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[0.8125rem] text-ink-2">{t('filters.to')}</span>
          <input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className={inputClass} />
        </label>
      </div>
    </Sheet>
  )
}

/** A folded paper map with one ink pin. */
function MapArt() {
  return (
    <svg width="112" height="96" viewBox="0 0 112 96" fill="none" aria-hidden="true">
      <path d="M18 24l24-8 28 8 24-8v56l-24 8-28-8-24 8z" fill="var(--wj-leaf)" stroke="var(--wj-rule)" strokeLinejoin="round" />
      <path d="M42 16v56M70 24v56" stroke="var(--wj-rule)" />
      <path d="M26 54c10-6 18 4 28-2s16-10 30-4" stroke="var(--wj-rule)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 6" />
      <path d="M78 46c0-7 6-12 6-12s6 5 6 12a6 6 0 0 1-12 0z" fill="var(--wj-accent)" transform="translate(-2 -14)" />
    </svg>
  )
}
