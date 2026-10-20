import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { LayerGroup, Map as LeafletMap, TileLayer } from 'leaflet'
import { leafletApi } from './leafletSetup'
import type { MapPlace } from '../../lib/types'
import './map.css'

interface MapCanvasProps {
  places: MapPlace[]
  tileUrl: string
  attribution: string
  onTileError: () => void
  onUnavailable: () => void
  onOpenEntry: (entryId: number) => void
}

/** A pin drawn inline, so the map needs no image files. */
const PIN = [
  '<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
  '<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" ',
  'fill="var(--accent)" stroke="var(--paper-raised)" stroke-width="1.5"/>',
  '<circle cx="12" cy="12" r="4.5" fill="var(--accent-contrast)"/>',
  '</svg>',
].join('')

/**
 * The map, with one marker per place.
 *
 * Leaflet is driven directly instead of through a wrapper, because the
 * clustering plugin extends the global `L` object.
 */
export function MapCanvas({
  places,
  tileUrl,
  attribution,
  onTileError,
  onUnavailable,
  onOpenEntry,
}: MapCanvasProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const layerRef = useRef<LayerGroup | null>(null)
  const tilesRef = useRef<TileLayer | null>(null)

  // The callbacks change on every render of the page, so they are kept in
  // refs: the map itself is only built once.
  const tileErrorRef = useRef(onTileError)
  const unavailableRef = useRef(onUnavailable)
  const openEntryRef = useRef(onOpenEntry)
  tileErrorRef.current = onTileError
  unavailableRef.current = onUnavailable
  openEntryRef.current = onOpenEntry

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const L = leafletApi()
    if (!L) {
      unavailableRef.current()
      return
    }

    const map = L.map(container, { center: [20, 0], zoom: 2, scrollWheelZoom: false })
    mapRef.current = map

    const layer = L.layerGroup()
    layer.addTo(map)
    layerRef.current = layer

    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)

    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      layerRef.current = null
    }
  }, [])

  useEffect(() => {
    const L = leafletApi()
    const map = mapRef.current
    if (!L || !map) return

    tilesRef.current?.remove()
    const tiles = L.tileLayer(tileUrl, { attribution, maxZoom: 19 })
    tiles.on('tileerror', () => tileErrorRef.current())
    tiles.addTo(map)
    tilesRef.current = tiles

    return () => {
      tiles.remove()
      tilesRef.current = null
    }
  }, [tileUrl, attribution])

  useEffect(() => {
    const L = leafletApi()
    const map = mapRef.current
    const layer = layerRef.current
    if (!L || !map || !layer) return

    layer.clearLayers()
    if (places.length === 0) return

    const icon = L.divIcon({
      className: 'wj-marker',
      html: PIN,
      iconSize: [24, 32],
      iconAnchor: [12, 32],
      popupAnchor: [0, -30],
    })

    const markers = places.map((place) => {
      const marker = L.marker([place.latitude, place.longitude], {
        icon,
        title: place.name || place.title,
      })
      marker.bindPopup(popupContent(place, t, openEntryRef))
      return marker
    })

    const cluster = L.markerClusterGroup
    if (typeof cluster === 'function') {
      const group = cluster({
        showCoverageOnHover: false,
        maxClusterRadius: 64,
        iconCreateFunction: (markerCluster) =>
          L.divIcon({
            className: 'wj-cluster-icon',
            html: `<div class="wj-cluster">${markerCluster.getChildCount()}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
      })
      group.addLayers(markers)
      layer.addLayer(group)
    } else {
      for (const marker of markers) layer.addLayer(marker)
    }

    const bounds = L.latLngBounds(places.map((place) => [place.latitude, place.longitude]))
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 })
    }
  }, [places, t])

  return <div ref={containerRef} className="h-full w-full" role="application" aria-label={t('map.title')} />
}

/**
 * The popup of a marker. The text is set as text, never as markup, because
 * the names come from the user.
 */
function popupContent(
  place: MapPlace,
  t: TFunction,
  openEntry: { current: (entryId: number) => void },
): HTMLElement {
  const root = document.createElement('div')
  root.className = 'wj-popup'

  const name = document.createElement('p')
  name.className = 'wj-popup-name'
  name.textContent = place.name || place.title || t('map.unnamedPlace', 'Unnamed place')
  root.appendChild(name)

  if (place.address) {
    const address = document.createElement('p')
    address.className = 'wj-popup-address'
    address.textContent = place.address
    root.appendChild(address)
  }

  if (place.entryId) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'wj-popup-link'
    button.textContent = t('map.openEntry')
    button.addEventListener('click', () => openEntry.current(place.entryId as number))
    root.appendChild(button)
  }

  return root
}
