import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api } from '../lib/api'
import { useAuth } from '../state/auth'
import { useToast } from '../state/toast'
import { Button, EmptyState, ErrorState, Skeleton } from '../components/ui'
import { MapCanvas } from '../components/map/MapCanvas'
import { MapFilters, type FolderFilter } from '../components/map/MapFilters'
import { formatEventDate } from '../lib/format'
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  CloseIcon,
  LocationIcon,
  MapIcon,
  NavigationIcon,
} from '../components/icons'
import type { MapPlace } from '../lib/types'

/** OpenStreetMap tiles, used until the reader configures their own. */
const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const DEFAULT_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/** The credit line for a tile server the reader brought themselves. */
function attributionFor(tileUrl: string): string {
  if (tileUrl === DEFAULT_TILE_URL) return DEFAULT_ATTRIBUTION
  try {
    const url = new URL(tileUrl.replace(/\{[^}]*\}/g, '0'))
    return `&copy; <a href="${url.origin}">${url.host}</a>`
  } catch {
    return ''
  }
}

/**
 * The map of everything that was written somewhere. The map itself runs
 * edge to edge, the way the native one does, and the places are listed
 * underneath it.
 */
export function MapPage({ embedded = false }: { embedded?: boolean }) {
  const { t, i18n } = useTranslation()
  const { describe } = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()

  const language = user?.settings.language ?? i18n.resolvedLanguage ?? 'en'

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [folderId, setFolderId] = useState<FolderFilter>('')
  const [tags, setTags] = useState<number[]>([])
  const [filterOpen, setFilterOpen] = useState(false)

  const [places, setPlaces] = useState<MapPlace[]>([])
  const [selected, setSelected] = useState<MapPlace | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [tileError, setTileError] = useState(false)
  const [mapUnavailable, setMapUnavailable] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [focusToken, setFocusToken] = useState(0)
  const [atList, setAtList] = useState(false)

  const listRef = useRef<HTMLElement>(null)

  const folderFilter = folderId === '' ? undefined : folderId
  const tagFilter = useMemo(() => (tags.length > 0 ? tags : undefined), [tags])

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    void (async () => {
      try {
        const page = await api.locations({ folderId: folderFilter, tags: tagFilter })
        if (cancelled) return
        setPlaces(page.items)
        setError('')
        setStatus('ready')
      } catch (err) {
        if (cancelled) return
        setError(describe(err, t('errors.generic')))
        setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [folderFilter, tagFilter, reloadToken, describe, t])

  /**
   * The date filter uses the day of the entry a place belongs to, which is
   * the day the reader means, rather than the day the place was stored.
   */
  const visiblePlaces = useMemo(() => {
    if (!from && !to) return places
    return places.filter((place) => {
      if (!place.date) return false
      if (from && place.date < from) return false
      if (to && place.date > to) return false
      return true
    })
  }, [places, from, to])

  const withPhotos = useMemo(
    () => visiblePlaces.filter((place) => Boolean(place.thumbUrl)),
    [visiblePlaces],
  )

  const tileUrl = user?.settings.mapTileUrl?.trim() || DEFAULT_TILE_URL
  const attribution = attributionFor(tileUrl)

  function reset() {
    setFrom('')
    setTo('')
    setFolderId('')
    setTags([])
  }

  /** The folded map in the corner flips between the map and the list. */
  function toggleList() {
    if (atList) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setAtList(false)
      return
    }
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setAtList(true)
  }

  return (
    <div>
      {/* --- the map, edge to edge --- */}
      <div
        className={
          embedded
            ? 'relative h-80 overflow-hidden rounded-3xl sm:h-96'
            : 'relative h-[100dvh] overflow-hidden'
        }
      >
        {status === 'loading' ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : status === 'error' ? (
          <div className="p-4">
            <ErrorState message={error} onRetry={() => setReloadToken((token) => token + 1)} />
          </div>
        ) : mapUnavailable ? (
          <div className="p-4">
            <EmptyState
              title={t('map.unavailable', 'The map could not be loaded')}
              body={t('map.unavailableBody', 'The places are still listed below.')}
            />
          </div>
        ) : (
          <MapCanvas
            places={visiblePlaces}
            tileUrl={tileUrl}
            attribution={attribution}
            onTileError={() => setTileError(true)}
            onUnavailable={() => setMapUnavailable(true)}
            onSelectPlace={setSelected}
            focusToken={focusToken}
          />
        )}

        {/* --- the round glass button in the corner --- */}
        {embedded ? null : (
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label={t('map.back', 'Back')}
            title={t('map.back', 'Back')}
            className="absolute top-[calc(var(--header-h)+0.75rem)] left-3 z-10 flex size-10 items-center justify-center rounded-full bg-white/80 text-ink-strong shadow-float backdrop-blur-xl transition-transform active:scale-90"
          >
            <ChevronLeftIcon size={20} />
          </button>
        )}

        {/* --- the pill of controls --- */}
        <div
          className={`absolute right-3 z-10 flex items-center gap-0.5 rounded-full bg-white/80 p-1 shadow-float backdrop-blur-xl ${
            embedded ? 'top-3' : 'top-[calc(var(--header-h)+0.75rem)]'
          }`}
        >
          <button
            type="button"
            onClick={() => setFocusToken((token) => token + 1)}
            aria-label={t('map.recenter', 'Show all places')}
            title={t('map.recenter', 'Show all places')}
            className="flex size-9 items-center justify-center rounded-full text-ink-strong transition-transform active:scale-90"
          >
            <NavigationIcon size={19} />
          </button>
          <button
            type="button"
            onClick={toggleList}
            aria-label={atList ? t('map.showMap', 'Show the map') : t('map.showList', 'Show the places')}
            title={atList ? t('map.showMap', 'Show the map') : t('map.showList', 'Show the places')}
            className="flex size-9 items-center justify-center rounded-full text-ink-strong transition-transform active:scale-90"
          >
            <MapIcon size={19} />
          </button>
        </div>

        {selected ? (
          <PlaceSheet
            place={selected}
            language={language}
            embedded={embedded}
            onClose={() => setSelected(null)}
          />
        ) : null}
      </div>

      {/* --- everything the map does not show --- */}
      <div className={embedded ? 'pt-4' : 'mx-auto w-full max-w-3xl px-4 pt-5 sm:px-6 lg:max-w-4xl'}>
        <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            {embedded ? (
              <h2 className="title-section text-ink-muted">{t('map.title')}</h2>
            ) : (
              <h1 className="title-large text-ink-strong">{t('map.title')}</h1>
            )}
            <p className="mt-1 text-sm text-ink-muted">
              {visiblePlaces.length === 1
                ? t('map.onePlace')
                : t('map.places', { count: visiblePlaces.length })}
            </p>
          </div>
          <Button
            variant={filterOpen ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setFilterOpen((value) => !value)}
          >
            {t('map.filters', 'Filters')}
            <ChevronDownIcon
              size={13}
              className={filterOpen ? 'rotate-180 transition-transform' : 'transition-transform'}
            />
          </Button>
        </header>

        {filterOpen ? (
          <div className="card mb-3 p-4 animate-sheet-up">
            <MapFilters
              from={from}
              to={to}
              folderId={folderId}
              tags={tags}
              onFromChange={setFrom}
              onToChange={setTo}
              onFolderChange={setFolderId}
              onTagsChange={setTags}
              onReset={reset}
            />
          </div>
        ) : null}

        {tileError && !mapUnavailable ? (
          <p className="mb-2 text-xs text-danger">{t('map.tileError')}</p>
        ) : null}

        {withPhotos.length > 0 ? (
          <section className="mt-4" aria-label={t('map.listTitle', 'Places')}>
            <h2 className="mb-2 px-1 text-[0.8125rem] font-semibold tracking-wide text-ink-faint uppercase">
              {t('map.photos', 'Photos')}
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {withPhotos.map((place) => (
                <Link
                  key={place.id}
                  to={place.entryId ? `/entries/${place.entryId}` : '#'}
                  className="w-40 shrink-0 overflow-hidden rounded-2xl bg-paper-raised shadow-sm transition-shadow hover:shadow-md"
                >
                  <img
                    src={place.thumbUrl}
                    alt={place.name || place.title}
                    loading="lazy"
                    decoding="async"
                    className="h-28 w-full object-cover"
                  />
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold text-ink-strong">
                      {place.name || place.title || t('map.unnamedPlace', 'Unnamed place')}
                    </p>
                    {place.date ? (
                      <p className="truncate text-xs text-ink-faint">
                        {formatEventDate(place.date, language)}
                      </p>
                    ) : null}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section
          ref={listRef}
          className="mt-4 scroll-mt-[calc(var(--header-h)+1rem)]"
          aria-label={t('map.places', { count: visiblePlaces.length })}
        >
          <h2 className="mb-2 px-1 text-[0.8125rem] font-semibold tracking-wide text-ink-faint uppercase">
            {t('map.listTitle', 'Places')}
          </h2>

          {visiblePlaces.length === 0 ? (
            <EmptyState title={t('map.empty')} body={t('map.emptyBody')} />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {visiblePlaces.map((place) => (
                <li
                  key={place.id}
                  className="flex items-center gap-3 rounded-2xl bg-paper-raised p-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)]"
                >
                  {place.thumbUrl ? (
                    <img
                      src={place.thumbUrl}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="size-12 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-paper-sunken text-ink-faint">
                      <LocationIcon size={20} />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9375rem] font-semibold text-ink-strong">
                      {place.name || place.title || t('map.unnamedPlace', 'Unnamed place')}
                    </p>
                    {place.address ? (
                      <p className="truncate text-sm text-ink-muted">{place.address}</p>
                    ) : null}
                  </div>

                  {place.entryCount > 1 ? (
                    <span className="shrink-0 rounded-full bg-paper-sunken px-2 py-0.5 text-xs font-semibold text-ink-muted tabular-nums">
                      {place.entryCount}
                    </span>
                  ) : null}

                  {place.entryId ? (
                    <Link
                      to={`/entries/${place.entryId}`}
                      className="shrink-0 text-sm font-semibold text-accent-ink hover:underline"
                    >
                      {t('map.openEntry')}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * The sheet that slides up when a pin is tapped, the way the native map
 * shows the memory that hangs on a place.
 */
function PlaceSheet({
  place,
  language,
  embedded,
  onClose,
}: {
  place: MapPlace
  language: string
  embedded?: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()
  const title = place.name || place.title || t('map.unnamedPlace', 'Unnamed place')

  return (
    <div
      className={`absolute inset-x-0 z-20 px-3 animate-sheet-up ${
        embedded ? 'bottom-3' : 'bottom-[calc(var(--bottom-nav-h)+0.5rem)]'
      }`}
    >
      <div className="rounded-3xl bg-paper-overlay/95 p-2.5 shadow-lift backdrop-blur-2xl">
        <div className="relative mb-2">
          <span className="mx-auto block h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('entries.close')}
            className="absolute top-0 right-0 flex size-7 items-center justify-center rounded-full bg-paper-sunken/80 text-ink-muted backdrop-blur transition-colors hover:text-ink"
          >
            <CloseIcon size={14} />
          </button>
        </div>

        {place.thumbUrl ? (
          <img
            src={place.thumbUrl}
            alt=""
            className="h-44 w-full rounded-2xl bg-paper-sunken object-cover"
          />
        ) : null}

        <div className="flex items-center gap-3 px-1 pt-2.5 pb-1">
          {place.thumbUrl ? null : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-paper-sunken text-ink-faint">
              <LocationIcon size={22} />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9375rem] font-semibold text-ink-strong">{title}</p>
            {place.address ? (
              <p className="truncate text-sm text-ink-muted">{place.address}</p>
            ) : null}
            <p className="mt-0.5 text-xs text-ink-faint">
              {place.date ? formatEventDate(place.date, language) : null}
              {place.date && place.entryCount > 1 ? ' · ' : null}
              {place.entryCount > 1 ? t('map.places', { count: place.entryCount }) : null}
            </p>
          </div>

          {place.entryId ? (
            <Link
              to={`/entries/${place.entryId}`}
              className="shrink-0 rounded-full bg-accent px-3.5 py-2 text-sm font-semibold text-accent-contrast transition-transform active:scale-95"
            >
              {t('map.openEntry')}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default MapPage
