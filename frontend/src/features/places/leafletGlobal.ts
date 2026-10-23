import * as Leaflet from 'leaflet'
import 'leaflet/dist/leaflet.css'

/**
 * The clustering plugin extends the global `L`, so the global has to exist
 * before the plugin is evaluated. This module runs first for that reason.
 */
const scope = globalThis as unknown as { L?: typeof Leaflet }
scope.L = scope.L ?? { ...Leaflet }

export {}
