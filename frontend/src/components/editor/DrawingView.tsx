import type { Stroke } from '../../lib/types'

const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 750

function pathOf(points: Array<[number, number]>): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points
  let d = `M ${(first[0] * VIEW_WIDTH).toFixed(1)} ${(first[1] * VIEW_HEIGHT).toFixed(1)}`
  for (const [x, y] of rest) {
    d += ` L ${(x * VIEW_WIDTH).toFixed(1)} ${(y * VIEW_HEIGHT).toFixed(1)}`
  }
  return d
}

/** Renders a stored drawing as vectors, without touching a canvas. */
export function DrawingView({ strokes, className }: { strokes: Stroke[]; className?: string }) {
  if (!strokes || strokes.length === 0) return null
  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      className={className ?? 'block aspect-[4/3] w-full'}
      role="img"
      aria-label="drawing"
    >
      {strokes.map((stroke, index) => (
        <path
          key={stroke.id ?? index}
          d={pathOf(stroke.points)}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  )
}
