import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Popover } from '../../ui/Popover'
import { ChevronRightIcon, CloseIcon, FilterIcon, LocateIcon, PlaceIcon } from '../../ui/icons'
import { MapCanvas } from './MapCanvas'
import { DEFAULT_TILE_URL, creditFor } from './tiles'

const OSM = DEFAULT_TILE_URL

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
  const filterRef = useRef<HTMLButtonElement>(null)

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
          <IconButton
            ref={filterRef}
            label={t('map.filter')}
            active={filtered}
            onClick={() => setFilterOpen((open) => !open)}
          >
            <FilterIcon size={22} />
          </IconButton>
        }
      />
      <PageTitle sub={places.data ? t('map.count', { count: visible.length }) : null}>{t('map.title')}</PageTitle>

      {places.loading ? (
        <Skeleton className="h-[52dvh] min-h-80 w-full rounded-xl" />
      ) : places.error && !places.data ? (
        <ErrorState message={describe(places.error)} onRetry={() => void places.reload()} />
      ) : (places.data ?? []).length === 0 && !filtered ? (
        <EmptyState art={<MapArt />} title={t('map.emptyTitle')} body={t('map.emptyBody')} />
      ) : (
        <>
          <div className="relative isolate h-[52dvh] min-h-80 overflow-hidden rounded-xl bg-well hairline">
            {unavailable ? (
              <p className="body-2 flex size-full items-center justify-center px-8 text-center text-ink-2">{t('map.unavailable')}</p>
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
            <div className="absolute top-3 right-3 z-[500] flex flex-col overflow-hidden rounded-lg glass hairline shadow-float">
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
          {tileError ? <p className="caption mt-2 text-ink-3">{t('map.tileError')}</p> : null}

          <ul className="mt-5 overflow-hidden rounded-xl bg-leaf hairline">
            {visible.map((place, index) => (
              <li key={place.id} className={cn(index > 0 && 'border-t border-rule')}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(place)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  className="press flex min-h-16 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-well/60"
                >
                  {place.thumbUrl ? (
                    <img src={place.thumbUrl} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg bg-well object-cover" />
                  ) : (
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <PlaceIcon size={20} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="title-2 block truncate text-ink">{place.name || place.title || t('map.unnamed')}</span>
                    <span className="caption block truncate text-ink-3">
                      {place.date ? formatEventDate(place.date, language, dateFormat) : place.address}
                    </span>
                  </span>
                  {place.entryCount > 1 ? <span className="tnum caption text-ink-3">{place.entryCount}</span> : null}
                  <ChevronRightIcon size={18} className="shrink-0 text-ink-3" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <PlaceFilterMenu
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        anchorRef={filterRef}
        value={filters}
        onApply={setFilters}
      />
    </>
  )
}

function PlaceCard({ place, language, dateFormat, onClose }: { place: MapPlace; language: string; dateFormat?: string; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="absolute inset-x-3 bottom-3 z-[500] animate-rise">
      <div className="glass flex items-center gap-3 rounded-xl p-2.5 shadow-float hairline">
        {place.thumbUrl ? (
          <img src={place.thumbUrl} alt="" className="size-14 shrink-0 rounded-lg bg-well object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <PlaceIcon size={24} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="title-2 truncate text-ink">{place.name || place.title || t('map.unnamed')}</p>
          <p className="caption truncate text-ink-2">
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

function PlaceFilterMenu({
  open,
  onClose,
  anchorRef,
  value,
  onApply,
}: {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
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
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement="bottom-end"
      label={t('map.filter')}
      className="w-76 max-w-[calc(100vw_-_1.5rem)] overflow-hidden"
    >
      <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
        <h2 className="title-2 text-ink">{t('map.filter')}</h2>
        <button
          type="button"
          onClick={() => setDraft(NONE)}
          className="press -mr-1 h-8 rounded-md px-2 text-sm font-medium text-ink-2 hover:bg-well hover:text-ink"
        >
          {t('common.clear')}
        </button>
      </header>

      <div className="max-h-[min(58vh,25rem)] overflow-y-auto overscroll-contain px-4 py-3">
      <h3 className="caption mb-2.5 text-ink-3">{t('folder.title')}</h3>
      <div className="flex flex-wrap gap-1.5">
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
          <h3 className="caption mt-5 mb-2.5 text-ink-3">{t('filters.tags')}</h3>
          <div className="flex flex-wrap gap-1.5">
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
      <h3 className="caption mt-5 mb-2.5 text-ink-3">{t('filters.dates')}</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="caption text-ink-3">{t('filters.from')}</span>
          <input type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => setDraft({ ...draft, from: event.target.value })} className={inputClass} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="caption text-ink-3">{t('filters.to')}</span>
          <input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => setDraft({ ...draft, to: event.target.value })} className={inputClass} />
        </label>
      </div>
      </div>

      <footer className="border-t border-rule p-2.5">
        <Button
          tone="primary"
          size="md"
          block
          onClick={() => {
            onApply(draft)
            onClose()
          }}
        >
          {t('common.done')}
        </Button>
      </footer>
    </Popover>
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
