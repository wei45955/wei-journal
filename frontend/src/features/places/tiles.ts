/**
 * The map sources the journal knows about.
 *
 * The tiles are drawn by a service of the reader's own choosing, and the
 * address is kept in the account settings, so a deployment can point the map
 * anywhere. The ones listed here need no key; a Chinese service is
 * recognised, and the points on the map are moved to match it.
 */

export interface TileSource {
  id: string
  label: string
  url: string
  /** The line the map shows in the corner. */
  credit: string
}

export const TILE_SOURCES: TileSource[] = [
  {
    id: 'osm',
    label: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    credit: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  {
    id: 'amap',
    label: '高德地图 Amap',
    url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    credit: '&copy; <a href="https://www.amap.com/">高德地图</a>',
  },
]

/** The map drawn when the account has no address of its own. */
export const DEFAULT_TILE_URL = TILE_SOURCES[0].url

/** The credit line for a tile address. */
export function creditFor(url: string): string {
  const known = TILE_SOURCES.find((source) => source.url === url)
  if (known) return known.credit
  try {
    const host = new URL(url.replace(/\{[^}]*\}/g, '0')).host
    return host.replace(/[<>&"]/g, '')
  } catch {
    return ''
  }
}

/**
 * The servers a tile address names. The Chinese service numbers its
 * servers, where the letters the map library uses by default do not fit.
 */
export function subdomainsFor(url: string): string | undefined {
  if (/webrd0\{s\}/i.test(url)) return '1234'
  return undefined
}
