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
 * The map of everything that was written somewhere.
 */
export function MapPage() {
  const { t, i18n } = useTranslation()
  const { describe } = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()

  const language = user?.settings.language ?? i18n.resolvedLanguage ?? 'en'

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [folderId, setFolderId] = useState<FolderFilter>('')
  const [tags, setTags] = useState<number[]>([])

  const [places, setPlaces] = useState<MapPlace[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [tileError, setTileError] = useState(false)
  const [mapUnavailable, setMapUnavailable] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  const frameRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  /**
   * The date filter uses the day of the entry a place belongs to, which is the
   * day the reader means, rather than the day the place was stored.
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

  const tileUrl = user?.settings.mapTileUrl?.trim() || DEFAULT_TILE_URL
  const attribution = attributionFor(tileUrl)

  function reset() {
    setFrom('')
    setTo('')
    setFolderId('')
    setTags([])
  }

  function toggleFullscreen() {
    const frame = frameRef.current
    if (!frame) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void frame.requestFullscreen()
    }
  }

  return (
    <div className="pb-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-ink-strong">{t('map.title')}</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {visiblePlaces.length === 1
              ? t('map.onePlace')
              : t('map.places', { count: visiblePlaces.length })}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={toggleFullscreen}>
          {fullscreen
            ? t('map.exitFullscreen', 'Leave full screen')
            : t('map.fullscreen', 'Full screen')}
        </Button>
      </header>

      <div className="mb-4 rounded-lg border border-line bg-paper-raised p-4">
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

      <div ref={frameRef} className="wj-map-frame">
        <div className="wj-map-area h-[60vh] min-h-[26rem] overflow-hidden rounded-lg border border-line">
          {status === 'loading' ? (
            <Skeleton className="h-full w-full" />
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
              onOpenEntry={(entryId) => navigate(`/entries/${entryId}`)}
            />
          )}
        </div>

        {tileError && !mapUnavailable ? (
          <p className="mt-2 text-xs text-danger">{t('map.tileError')}</p>
        ) : null}
      </div>

      <section className="mt-6" aria-label={t('map.places', { count: visiblePlaces.length })}>
        <h2 className="mb-2 font-[--font-sans] text-sm font-medium tracking-wide text-ink-muted uppercase">
          {t('map.listTitle', 'Places')}
        </h2>

        {visiblePlaces.length === 0 ? (
          <EmptyState title={t('map.empty')} body={t('map.emptyBody')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {visiblePlaces.map((place) => (
              <li
                key={place.id}
                className="rounded-lg border border-line bg-paper-raised p-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-[--font-sans] text-[0.9375rem] font-medium text-ink-strong">
                    {place.name || place.title || t('map.unnamedPlace', 'Unnamed place')}
                  </span>
                  {place.date ? (
                    <span className="text-xs text-ink-faint">
                      {formatEventDate(place.date, language)}
                    </span>
                  ) : null}
                </div>
                {place.address ? (
                  <p className="mt-0.5 text-sm text-ink-muted">{place.address}</p>
                ) : null}
                {place.entryId ? (
                  <Link
                    to={`/entries/${place.entryId}`}
                    className="mt-1 inline-block text-sm text-accent-ink hover:underline"
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
  )
}

export default MapPage
