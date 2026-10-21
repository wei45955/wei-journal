import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { useToast } from '../../state/toast'
import { Button, TextInput } from '../ui'
import { Dialog } from '../ui/Dialog'
import { CrosshairIcon, LocationIcon } from '../icons'
import type { GeocodeResult, PlaceRef } from '../../lib/types'

interface LocationPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (place: PlaceRef) => void
  current?: PlaceRef | null
}

/** The coordinates of a point, written the way a person would. */
function formatCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
}

/**
 * Chooses a place for an entry.
 *
 * The server's own places work everywhere. Finding a new place by name needs
 * the optional search service, so the dialog offers the position of the
 * phone as well, which needs nothing but the phone itself.
 */
export function LocationPicker({ open, onClose, onSelect, current }: LocationPickerProps) {
  const { t } = useTranslation()
  const { describe } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [ownPlaces, setOwnPlaces] = useState<GeocodeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    void (async () => {
      try {
        // The installation says whether it can look for new places. The
        // places of the reader work either way.
        const capabilities = await api.locationCapabilities().catch(() => ({ search: false }))
        if (cancelled) return
        setUnavailable(!capabilities.search)

        const own = await api.ownLocations(query)
        if (cancelled) return
        setOwnPlaces(own.items)

        // Nothing is looked for before a word is typed: the service would
        // be asked for an empty name.
        if (query.trim() === '' || !capabilities.search) {
          setResults([])
          return
        }
        const places = await api.geocode(query)
        if (cancelled) return
        setResults(places.items)
      } catch (err) {
        if (!cancelled) setError(describe(err, t('errors.generic')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, query, describe, t])

  /**
   * Asks the phone where it is. The name of the place is asked of the
   * server when it can, and the coordinates are used when it cannot.
   */
  async function useCurrentPosition() {
    setError('')
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError(t('entries.locationFailed'))
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude
        const longitude = position.coords.longitude
        const fallback: GeocodeResult = {
          name: formatCoordinates(latitude, longitude),
          address: '',
          latitude,
          longitude,
        }
        api
          .reverseGeocode(latitude, longitude)
          .then((page) => {
            const found = page.items[0]
            onSelect(found ?? fallback)
            onClose()
          })
          .catch(() => {
            onSelect(fallback)
            onClose()
          })
          .finally(() => setLocating(false))
      },
      (failure) => {
        setLocating(false)
        // The browser only offers the position on a secure origin.
        if (typeof window !== 'undefined' && !window.isSecureContext) {
          setError(t('entries.locationNeedsSecure'))
          return
        }
        if (failure.code === failure.PERMISSION_DENIED) {
          setError(t('entries.locationDenied'))
          return
        }
        setError(t('entries.locationFailed'))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  function choose(place: GeocodeResult) {
    onSelect({
      name: place.name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
    })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('entries.addLocation')}
      description={t('entries.searchLocation')}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('entries.close')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <TextInput
          type="search"
          value={query}
          autoFocus
          placeholder={t('entries.searchLocation')}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={t('entries.searchLocation')}
        />

        <Button
          variant="secondary"
          onClick={() => void useCurrentPosition()}
          loading={locating}
          icon={<CrosshairIcon size={16} />}
          className="w-full"
        >
          {t('entries.useCurrentLocation')}
        </Button>

        {unavailable ? (
          <p className="rounded-xl bg-paper-sunken px-3.5 py-2.5 text-sm text-ink-muted">
            {t('entries.locationSearchOff')}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? <p className="text-sm text-ink-faint">{t('common.loading')}</p> : null}

        {ownPlaces.length > 0 ? (
          <section className="flex flex-col gap-1">
            <h3 className="px-1 text-[0.6875rem] font-semibold tracking-wide text-ink-faint uppercase">
              {t('entries.yourPlaces')}
            </h3>
            <ul className="flex flex-col gap-1">
              {ownPlaces.map((place, index) => (
                <PlaceRow key={`own-${place.latitude}-${place.longitude}-${index}`} place={place} onChoose={choose} />
              ))}
            </ul>
          </section>
        ) : null}

        {results.length > 0 ? (
          <section className="flex flex-col gap-1">
            <h3 className="px-1 text-[0.6875rem] font-semibold tracking-wide text-ink-faint uppercase">
              {t('entries.searchResults')}
            </h3>
            <ul className="flex flex-col gap-1">
              {results.map((place, index) => (
                <PlaceRow key={`hit-${place.latitude}-${place.longitude}-${index}`} place={place} onChoose={choose} />
              ))}
            </ul>
          </section>
        ) : null}

        {!loading && ownPlaces.length === 0 && results.length === 0 ? (
          <p className="text-sm text-ink-faint">
            {query.trim() === '' ? t('entries.locationHint') : t('entries.empty.noResultsBody')}
          </p>
        ) : null}

        {current ? (
          <p className="border-t border-line pt-3 text-xs text-ink-faint">
            {t('entries.location')}: {current.name || current.address}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}

/** One place in the list of suggestions. */
function PlaceRow({
  place,
  onChoose,
}: {
  place: GeocodeResult
  onChoose: (place: GeocodeResult) => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onChoose(place)}
        className="flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-paper-sunken"
      >
        <LocationIcon size={16} className="mt-0.5 shrink-0 text-ink-faint" />
        <span className="min-w-0">
          <span className="block truncate text-sm text-ink">{place.name}</span>
          {place.address ? (
            <span className="block truncate text-xs text-ink-faint">{place.address}</span>
          ) : null}
        </span>
      </button>
    </li>
  )
}
