/* eslint-disable react-refresh/only-export-components */
import type { Stroke } from '../../lib/types'
import { safeColor } from '../../lib/safe'

export const VIEW_W = 1000
export const VIEW_H = 750

/** A smooth path through the points, using midpoints as quadratic anchors. */
export function pathOf(points: Array<[number, number]>): string {
  if (points.length === 0) return ''
  const p = points.map(([x, y]) => [x * VIEW_W, y * VIEW_H] as const)
  if (p.length === 1) return `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)} l 0.01 0`
  let d = `M ${p[0][0].toFixed(1)} ${p[0][1].toFixed(1)}`
  for (let i = 1; i < p.length - 1; i += 1) {
    const mx = (p[i][0] + p[i + 1][0]) / 2
    const my = (p[i][1] + p[i + 1][1]) / 2
    d += ` Q ${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`
  }
  const last = p[p.length - 1]
  d += ` L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`
  return d
}

/**
 * Strokes drawn in the ink colour follow the theme, so a sketch reads in
 * dark mode too. Stored values are checked, so a stroke can only ever be a
 * colour.
 */
export function strokeColour(colour: string): string {
  if (colour === 'ink') return 'var(--wj-ink)'
  return safeColor(colour) ?? 'var(--wj-ink)'
}

export function strokeWidth(width: number): number {
  return Number.isFinite(width) ? Math.min(40, Math.max(1, width)) : 6
}

export function SketchView({ strokes, className, label }: { strokes: Stroke[]; className?: string; label?: string }) {
  if (!strokes.length) return null
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className={className ?? 'block aspect-[4/3] w-full'}
      role="img"
      aria-label={label}
    >
      {strokes.map((stroke, index) => (
        <path
          key={stroke.id ?? index}
          d={pathOf(stroke.points)}
          fill="none"
          stroke={strokeColour(stroke.color)}
          strokeWidth={strokeWidth(stroke.width)}
          strokeOpacity={stroke.opacity ?? 1}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
