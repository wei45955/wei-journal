import * as Leaflet from 'leaflet'

/**
 * Leaflet publishes itself on `window.L`, and the clustering plugin extends
 * that global rather than the module namespace. This module makes sure the
 * global exists; it has to be imported before the plugin.
 */
const scope = globalThis as unknown as { L?: typeof Leaflet }

scope.L = scope.L ?? { ...Leaflet }

export {}
