import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { Stroke } from '../../lib/types'
import { Button } from '../ui'
import { ConfirmDialog } from '../ui/Dialog'
import { RedoIcon, TrashIcon, UndoIcon } from '../icons'
import { eraseFromStroke, useDrawing, type DrawingTool } from './useDrawing'

/** The logical size of the drawing surface. */
const VIEW_WIDTH = 1000
const VIEW_HEIGHT = 750
const ERASER_RADIUS = 26

const COLORS = ['#23201b', '#b8542f', '#5c7a63', '#3f6b47', '#8a6412', '#2f5d8a', '#7a4b86']

interface DrawingCanvasProps {
  strokes: Stroke[]
  onChange: (strokes: Stroke[]) => void
}

function toView(point: [number, number]): [number, number] {
  return [point[0] * VIEW_WIDTH, point[1] * VIEW_HEIGHT]
}

function toNormalized(point: [number, number]): [number, number] {
  return [point[0] / VIEW_WIDTH, point[1] / VIEW_HEIGHT]
}

function pathOf(points: Array<[number, number]>): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points.map(toView)
  let d = `M ${first[0].toFixed(1)} ${first[1].toFixed(1)}`
  for (const [x, y] of rest) d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`
  return d
}

/**
 * A vector drawing surface.
 *
 * Strokes are kept as points in a structured model, so a drawing can be
 * reopened and edited later instead of being a flat image.
 */
export function DrawingCanvas({ strokes, onChange }: DrawingCanvasProps) {
  const { t } = useTranslation()
  const history = useDrawing(strokes)
  const svgRef = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<DrawingTool>('pen')
  const [color, setColor] = useState(COLORS[0])
  const [width, setWidth] = useState(6)
  const [live, setLive] = useState<Stroke | null>(null)
  const [eraserPath, setEraserPath] = useState<Array<[number, number]>>([])
  const [confirmClear, setConfirmClear] = useState(false)
  const drawingRef = useRef(false)

  // Adopt the incoming strokes when the entry is opened, but never while the
  // user is drawing.
  useEffect(() => {
    if (drawingRef.current) return
    history.setStrokes(strokes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes])

  function publish(next: Stroke[]) {
    history.setStrokes(next)
    onChange(next)
  }

  function pointFromEvent(event: React.PointerEvent<SVGSVGElement>): [number, number] {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return [0, 0]
    return [
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    ]
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    history.beginChange()
    const point = pointFromEvent(event)
    if (tool === 'eraser') {
      setEraserPath([toView(point)])
    } else {
      setLive({ color, width, points: [point], tool: 'pen' })
    }
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawingRef.current) return
    const point = pointFromEvent(event)
    if (tool === 'eraser') {
      setEraserPath((current) => [...current, toView(point)])
      return
    }
    setLive((current) => {
      if (!current) return current
      const last = current.points[current.points.length - 1]
      // Skip points that are almost on top of the previous one.
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 0.004) return current
      return { ...current, points: [...current.points, point] }
    })
  }

  function handlePointerUp() {
    if (!drawingRef.current) return
    drawingRef.current = false

    if (tool === 'eraser') {
      if (eraserPath.length > 0) {
        const next: Stroke[] = []
        for (const stroke of history.strokes) {
          const viewPoints = stroke.points.map(toView)
          const segments = eraseFromStroke(
            { ...stroke, points: viewPoints },
            eraserPath,
            ERASER_RADIUS,
          )
          for (const segment of segments) {
            next.push({ ...segment, points: segment.points.map(toNormalized) })
          }
        }
        publish(next)
      }
      setEraserPath([])
      return
    }

    if (live && live.points.length > 0) {
      publish([...history.strokes, live])
    }
    setLive(null)
  }

  const visible = live ? [...history.strokes, live] : history.strokes

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-paper-sunken p-0.5">
          <button
            type="button"
            onClick={() => setTool('pen')}
            aria-pressed={tool === 'pen'}
            className={cn(
              'rounded-[0.625rem] px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors',
              tool === 'pen'
                ? 'bg-paper-raised text-accent-ink shadow-sm'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {t('drawing.pen')}
          </button>
          <button
            type="button"
            onClick={() => setTool('eraser')}
            aria-pressed={tool === 'eraser'}
            className={cn(
              'rounded-[0.625rem] px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors',
              tool === 'eraser'
                ? 'bg-paper-raised text-accent-ink shadow-sm'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            {t('drawing.eraser')}
          </button>
        </div>

        {tool === 'pen' ? (
          <>
            <div className="flex items-center gap-1" role="group" aria-label={t('drawing.colour')}>
              {COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  onClick={() => setColor(swatch)}
                  aria-label={swatch}
                  aria-pressed={color === swatch}
                  className={cn(
                    'size-6 rounded-full border-2 transition-transform',
                    color === swatch ? 'scale-110 border-ink' : 'border-transparent',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs text-ink-muted">
              {t('drawing.size')}
              <input
                type="range"
                min={2}
                max={28}
                step={1}
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
                className="w-24 accent-[var(--accent)]"
                aria-label={t('drawing.size')}
              />
            </label>
          </>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={history.undo}
            disabled={!history.canUndo}
            aria-label={t('drawing.undo')}
          >
            <UndoIcon size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={history.redo}
            disabled={!history.canRedo}
            aria-label={t('drawing.redo')}
          >
            <RedoIcon size={16} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmClear(true)}
            disabled={visible.length === 0}
            aria-label={t('drawing.clear')}
          >
            <TrashIcon size={16} />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-paper-raised">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          preserveAspectRatio="none"
          className="block aspect-[4/3] w-full touch-none select-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          role="img"
          aria-label={t('drawing.title')}
        >
          {visible.map((stroke, index) => (
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
          {eraserPath.length > 0 ? (
            <path
              d={pathOf(eraserPath.map((point) => toNormalized(point)))}
              fill="none"
              stroke="var(--ink-faint)"
              strokeWidth={ERASER_RADIUS * 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.18}
            />
          ) : null}
        </svg>
      </div>

      {visible.length === 0 ? (
        <p className="text-center text-xs text-ink-faint">{t('drawing.empty')}</p>
      ) : null}

      <ConfirmDialog
        open={confirmClear}
        title={t('drawing.clear')}
        description={t('drawing.clearConfirm')}
        confirmLabel={t('entries.delete')}
        destructive
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          history.clear()
          publish([])
        }}
      />
    </div>
  )
}
