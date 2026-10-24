import { useEffect, useRef } from 'react'
import type { LayerGroup, Map as LeafletMap } from 'leaflet'
import './leafletGlobal'
import 'leaflet.markercluster'
import { isChineseTiles, wgsToGcj } from '../../lib/coordinates'
import type { MapPlace } from '../../lib/types'

type LeafletApi = typeof import('leaflet')

function leaflet(): LeafletApi | null {
  return (globalThis as unknown as { L?: LeafletApi }).L ?? null
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Only same-origin media URLs may become a marker image. */
function safeThumb(url: string | undefined): string | null {
  if (!url || !url.startsWith('/api/')) return null
  return url
}

export interface MapHandle {
  fit: () => void
}

export function MapCanvas({
  places,
  tileUrl,
  attribution,
  focus,
  onSelect,
  onTileError,
  onUnavailable,
  fitToken,
  label,
}: {
  places: MapPlace[]
  tileUrl: string
  attribution: string
  focus?: MapPlace | null
  onSelect: (place: MapPlace) => void
  onTileError: () => void
  onUnavailable: () => void
  fitToken: number
  label: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const layer = useRef<LayerGroup | null>(null)
  const callbacks = useRef({ onSelect, onTileError, onUnavailable })
  callbacks.current = { onSelect, onTileError, onUnavailable }

  useEffect(() => {
    const L = leaflet()
    if (!L || !container.current) {
      callbacks.current.onUnavailable()
      return
    }
    const instance = L.map(container.current, { center: [30, 110], zoom: 3, zoomControl: false, attributionControl: true, worldCopyJump: true })
    map.current = instance
    layer.current = L.layerGroup().addTo(instance)
    const observer = new ResizeObserver(() => instance.invalidateSize())
    observer.observe(container.current)
    return () => {
      observer.disconnect()
      instance.remove()
      map.current = null
      layer.current = null
    }
  }, [])

  useEffect(() => {
    const L = leaflet()
    if (!L || !map.current) return
    const tiles = L.tileLayer(tileUrl, { attribution, maxZoom: 19, className: 'wj-tiles' })
    tiles.on('tileerror', () => callbacks.current.onTileError())
    tiles.addTo(map.current)
    return () => {
      tiles.remove()
    }
  }, [tileUrl, attribution])

  const fit = () => {
    const L = leaflet()
    if (!L || !map.current || places.length === 0) return
    const chinese = isChineseTiles(tileUrl)
    const bounds = L.latLngBounds(places.map((place) => {
      const [latitude, longitude] = chinese ? wgsToGcj(place.latitude, place.longitude) : [place.latitude, place.longitude]
      return [latitude, longitude]
    }))
    if (bounds.isValid()) map.current.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 })
  }

  useEffect(() => {
    const L = leaflet()
    if (!L || !map.current || !layer.current) return
    layer.current.clearLayers()
    // The Chinese tiles are drawn in their own coordinate system, so the
    // points have to be moved to match them or they sit a few hundred
    // metres away from the place they mark.
    const chinese = isChineseTiles(tileUrl)
    const markers = places.map((place) => {
      const thumb = safeThumb(place.thumbUrl)
      const html = thumb
        ? `<div class="wj-photo"><img src="${escapeAttribute(thumb)}" alt="" />${place.entryCount > 1 ? `<span>${place.entryCount}</span>` : ''}</div>`
        : '<div class="wj-pin"></div>'
      const icon = L.divIcon({
        className: 'wj-marker',
        html,
        iconSize: thumb ? [56, 56] : [18, 18],
        iconAnchor: thumb ? [28, 28] : [9, 9],
      })
      const [latitude, longitude] = chinese ? wgsToGcj(place.latitude, place.longitude) : [place.latitude, place.longitude]
      const marker = L.marker([latitude, longitude], { icon, title: place.name || place.title, keyboard: true })
      marker.on('click', () => callbacks.current.onSelect(place))
      return marker
    })
    if (typeof L.markerClusterGroup === 'function') {
      const group = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 56,
        iconCreateFunction: (cluster) =>
          L.divIcon({ className: 'wj-cluster-icon', html: `<div class="wj-cluster">${cluster.getChildCount()}</div>`, iconSize: [38, 38] }),
      })
      group.addLayers(markers)
      layer.current.addLayer(group)
    } else {
      markers.forEach((marker) => layer.current?.addLayer(marker))
    }
    if (!focus) fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places])

  useEffect(() => {
    if (fitToken > 0) fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken])

  useEffect(() => {
    if (!focus || !map.current) return
    const [latitude, longitude] = isChineseTiles(tileUrl) ? wgsToGcj(focus.latitude, focus.longitude) : [focus.latitude, focus.longitude]
    map.current.setView([latitude, longitude], Math.max(map.current.getZoom(), 14), { animate: true })
  }, [focus, tileUrl])

  return <div ref={container} className="size-full" role="application" aria-label={label} />
}
