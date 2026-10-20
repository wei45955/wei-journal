import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
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
  /** Called when a pin is tapped, so the page can open its sheet. */
  onSelectPlace: (place: MapPlace) => void
  /** Bumping this refits the map around the places that are shown. */
  focusToken?: number
}

/** A pin drawn inline, so the map needs no image files. */
const PIN = [
  '<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">',
  '<path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" ',
  'fill="var(--accent)" stroke="white" stroke-width="1.5"/>',
  '<circle cx="12" cy="12" r="4.5" fill="white"/>',
  '</svg>',
].join('')

/** Escapes a value that is interpolated into marker markup. */
function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * The map, with one marker per place. A place that has a photo is marked
 * with that photo, the way the native journal does it.
 */
export function MapCanvas({
  places,
  tileUrl,
  attribution,
  onTileError,
  onUnavailable,
  onSelectPlace,
  focusToken = 0,
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
  const selectPlaceRef = useRef(onSelectPlace)
  tileErrorRef.current = onTileError
  unavailableRef.current = onUnavailable
  selectPlaceRef.current = onSelectPlace

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const L = leafletApi()
    if (!L) {
      unavailableRef.current()
      return
    }

    const map = L.map(container, {
      center: [20, 0],
      zoom: 2,
      scrollWheelZoom: false,
      zoomControl: false,
    })
    mapRef.current = map

    L.control.zoom({ position: 'bottomright' }).addTo(map)

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

    const markers = places.map((place) => {
      const isPhoto = Boolean(place.thumbUrl)
      const photo = isPhoto
        ? `<img class="wj-photo-marker-image" src="${escapeAttribute(place.thumbUrl as string)}" alt="" />`
        : PIN
      const badge =
        isPhoto && place.entryCount > 1
          ? `<span class="wj-photo-marker-count">${place.entryCount}</span>`
          : ''
      const icon = L.divIcon({
        className: 'wj-marker',
        html: `<div class="wj-photo-marker${isPhoto ? ' wj-photo-marker--photo' : ''}">${photo}${badge}</div>`,
        iconSize: (isPhoto ? [72, 72] : [24, 32]) as [number, number],
        iconAnchor: (isPhoto ? [36, 36] : [12, 32]) as [number, number],
      })

      const marker = L.marker([place.latitude, place.longitude], {
        icon,
        title: place.name || place.title,
      })
      marker.on('click', () => selectPlaceRef.current(place))
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
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          }),
      })
      group.addLayers(markers)
      layer.addLayer(group)
    } else {
      for (const marker of markers) layer.addLayer(marker)
    }

    const bounds = L.latLngBounds(places.map((place) => [place.latitude, place.longitude]))
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    }
  }, [places])

  useEffect(() => {
    const L = leafletApi()
    const map = mapRef.current
    if (!L || !map || focusToken === 0) return
    const bounds = L.latLngBounds(places.map((place) => [place.latitude, place.longitude]))
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    }
  }, [focusToken, places])

  return <div ref={containerRef} className="h-full w-full" role="application" aria-label={t('map.title')} />
}
