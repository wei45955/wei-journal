import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, ApiError } from '../../lib/api'
import { useToast } from '../../state/toast'
import { Button, TextInput } from '../ui'
import { Dialog } from '../ui/Dialog'
import { LocationIcon } from '../icons'
import type { GeocodeResult, PlaceRef } from '../../lib/types'

interface LocationPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (place: PlaceRef) => void
  current?: PlaceRef | null
}

/**
 * Chooses a place for an entry.
 *
 * The server's own places work everywhere. Searching for new places needs
 * the optional geocoding service, and the dialog says so when it is off
 * rather than pretending to work.
 */
export function LocationPicker({ open, onClose, onSelect, current }: LocationPickerProps) {
  const { t } = useTranslation()
  const { describe } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GeocodeResult[]>([])
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    setError('')
    void (async () => {
      try {
        const [places, own] = await Promise.all([
          api.geocode(query).catch((err) => {
            if (err instanceof ApiError && err.status === 503) {
              setUnavailable(true)
              return { items: [] as GeocodeResult[] }
            }
            throw err
          }),
          api.ownLocations(query),
        ])
        if (cancelled) return
        setResults([...places.items, ...own.items])
        setUnavailable(false)
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

        {unavailable ? (
          <p className="rounded-xl bg-paper-sunken px-3.5 py-2.5 text-sm text-ink-muted">
            {t('entries.locationUnavailable')}
          </p>
        ) : null}

        {error ? (
          <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? <p className="text-sm text-ink-faint">{t('common.loading')}</p> : null}

        {!loading && results.length === 0 && !unavailable ? (
          <p className="text-sm text-ink-faint">{t('entries.empty.noResultsBody')}</p>
        ) : null}

        <ul className="flex flex-col gap-1">
          {results.map((place, index) => (
            <li key={`${place.latitude}-${place.longitude}-${index}`}>
              <button
                type="button"
                onClick={() => {
                  onSelect({
                    name: place.name,
                    address: place.address,
                    latitude: place.latitude,
                    longitude: place.longitude,
                  })
                  onClose()
                }}
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
          ))}
        </ul>

        {current ? (
          <p className="border-t border-line pt-3 text-xs text-ink-faint">
            {t('entries.location')}: {current.name || current.address}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
