import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import type { GeocodeResult, PlaceRef } from '../../lib/types'
import { Button, Spinner, TextInput } from '../../ui'
import { Sheet } from '../../ui/Sheet'
import { LocateIcon, PlaceIcon, SearchIcon } from '../../ui/icons'

function coordinates(latitude: number, longitude: number) {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
}

/**
 * Chooses a place: the reader's own places, a name search when the server
 * offers one, or the position of the phone.
 */
export function PlaceSheet({
  open,
  onClose,
  current,
  onSelect,
  onRemove,
}: {
  open: boolean
  onClose: () => void
  current?: PlaceRef | null
  onSelect: (place: PlaceRef) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  const [own, setOwn] = useState<GeocodeResult[]>([])
  const [found, setFound] = useState<GeocodeResult[]>([])
  const [canSearch, setCanSearch] = useState(true)
  const [loading, setLoading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) return
    setQuery('')
    setTerm('')
    setFound([])
    setError('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => setTerm(query.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [open, query])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const capabilities = await api.locationCapabilities().catch(() => ({ search: false }))
        if (cancelled) return
        setCanSearch(capabilities.search)
        const mine = await api.ownLocations(term)
        if (cancelled) return
        setOwn(mine.items)
        if (!term || !capabilities.search) {
          setFound([])
          return
        }
        const results = await api.geocode(term)
        if (!cancelled) setFound(results.items)
      } catch {
        if (!cancelled) setFound([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, term])

  function choose(place: GeocodeResult) {
    onSelect({ name: place.name, address: place.address, latitude: place.latitude, longitude: place.longitude })
    onClose()
  }

  function locate() {
    setError('')
    if (!navigator.geolocation) {
      setError(t('place.failed'))
      return
    }
    if (!window.isSecureContext) {
      setError(t('place.insecure'))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const fallback = { name: coordinates(coords.latitude, coords.longitude), address: '', latitude: coords.latitude, longitude: coords.longitude }
        api
          .reverseGeocode(coords.latitude, coords.longitude)
          .then((page) => choose(page.items[0] ?? fallback))
          .catch(() => choose(fallback))
          .finally(() => setLocating(false))
      },
      (failure) => {
        setLocating(false)
        setError(failure.code === failure.PERMISSION_DENIED ? t('place.denied') : t('place.failed'))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  const row = (place: GeocodeResult, key: string) => (
    <li key={key}>
      <button
        type="button"
        onClick={() => choose(place)}
        className="flex min-h-[56px] w-full items-center gap-3 rounded-[14px] px-3 text-left active:bg-well"
      >
        <PlaceIcon size={20} className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[1rem] text-ink">{place.name || coordinates(place.latitude, place.longitude)}</span>
          {place.address && place.address !== place.name ? (
            <span className="block truncate text-[0.8125rem] text-ink-3">{place.address}</span>
          ) : null}
        </span>
      </button>
    </li>
  )

  return (
    <Sheet open={open} onClose={onClose} title={t('place.title')} tall>
      <div className="sticky top-0 z-10 -mx-5 bg-leaf px-5 pt-1 pb-3">
        <div className="relative">
          <SearchIcon size={19} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
          <TextInput
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('place.search')}
            aria-label={t('place.search')}
            className="pl-10"
            enterKeyHint="search"
          />
        </div>
        <Button block tone="secondary" className="mt-2.5" loading={locating} icon={<LocateIcon size={19} />} onClick={locate}>
          {locating ? t('place.locating') : t('place.here')}
        </Button>
      </div>

      {error ? <p className="mt-1 rounded-[14px] bg-danger-soft px-4 py-3 text-[0.875rem] text-danger">{error}</p> : null}
      {!canSearch && query ? <p className="mt-1 text-[0.8125rem] leading-snug text-ink-3">{t('place.searchOff')}</p> : null}

      {own.length > 0 ? (
        <section className="mt-3">
          <h3 className="px-1 text-[0.8125rem] text-ink-3">{t('place.yours')}</h3>
          <ul className="-mx-2 mt-1">{own.map((place, index) => row(place, `own-${index}`))}</ul>
        </section>
      ) : null}
      {found.length > 0 ? (
        <section className="mt-3">
          <h3 className="px-1 text-[0.8125rem] text-ink-3">{t('place.results')}</h3>
          <ul className="-mx-2 mt-1">{found.map((place, index) => row(place, `hit-${index}`))}</ul>
        </section>
      ) : null}
      {loading ? (
        <div className="flex justify-center py-6 text-ink-3">
          <Spinner />
        </div>
      ) : own.length === 0 && found.length === 0 ? (
        <p className="py-6 text-center text-[0.9375rem] text-ink-3">{query ? t('place.none') : t('place.hint')}</p>
      ) : null}

      {current ? (
        <div className="mt-4 border-t border-rule pt-3">
          <button
            type="button"
            onClick={() => {
              onRemove()
              onClose()
            }}
            className="press h-11 rounded-full px-1 text-[0.9375rem] text-danger"
          >
            {t('place.remove')}
          </button>
        </div>
      ) : null}
    </Sheet>
  )
}
