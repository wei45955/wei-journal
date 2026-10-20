import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import './leafletGlobal'
import 'leaflet.markercluster'

/**
 * The map library.
 *
 * `leafletGlobal` has to be evaluated before the clustering plugin, because
 * the plugin extends the global `L` when it is loaded. The import order here
 * is what guarantees that, so it must not be shuffled.
 */

export type LeafletApi = typeof import('leaflet')

/** The Leaflet object the map is built with, including the cluster helpers. */
export function leafletApi(): LeafletApi | null {
  const scope = globalThis as unknown as { L?: LeafletApi }
  return scope.L ?? null
}
