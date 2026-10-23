import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import type { Stroke } from '../../lib/types'
import { IconButton } from '../../ui'
import { ConfirmSheet } from '../../ui/Sheet'
import { EraserIcon, PenIcon, RedoIcon, TrashIcon, UndoIcon } from '../../ui/icons'
import { eraseFromStroke, useStrokeHistory } from './strokes'
import { pathOf, strokeColour, VIEW_H, VIEW_W } from './SketchView'

const COLOURS = ['ink', '#27467a', '#2f6b4f', '#b4532a', '#8a5a9e', '#c99a2e']
const WIDTHS = [3, 6, 12]
const ERASER = 28

/**
 * A vector sketch pad. Strokes are stored as points, so a sketch can be
 * reopened and changed later and stays sharp at any size.
 */
export function SketchPad({ strokes, onChange }: { strokes: Stroke[]; onChange: (next: Stroke[]) => void }) {
  const { t } = useTranslation()
  const history = useStrokeHistory(strokes)
  const svg = useRef<SVGSVGElement>(null)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [colour, setColour] = useState('ink')
  const [width, setWidth] = useState(6)
  const [live, setLive] = useState<Stroke | null>(null)
  const [trail, setTrail] = useState<Array<[number, number]>>([])
  const [confirmClear, setConfirmClear] = useState(false)
  const pointer = useRef<number | null>(null)

  useEffect(() => {
    if (pointer.current === null) history.setStrokes(strokes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes])

  function publish(next: Stroke[]) {
    history.setStrokes(next)
    onChange(next)
  }

  function point(event: React.PointerEvent): [number, number] {
    const box = svg.current?.getBoundingClientRect()
    if (!box) return [0, 0]
    return [
      Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
    ]
  }

  function down(event: React.PointerEvent<SVGSVGElement>) {
    if (pointer.current !== null) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointer.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    history.beginChange()
    const p = point(event)
    if (tool === 'eraser') setTrail([[p[0] * VIEW_W, p[1] * VIEW_H]])
    else setLive({ id: `s${Date.now().toString(36)}`, color: colour, width, points: [p], tool: 'pen' })
  }

  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerId !== pointer.current) return
    const p = point(event)
    if (tool === 'eraser') {
      setTrail((current) => [...current, [p[0] * VIEW_W, p[1] * VIEW_H]])
      return
    }
    setLive((current) => {
      if (!current) return current
      const last = current.points[current.points.length - 1]
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.003) return current
      return { ...current, points: [...current.points, p] }
    })
  }

  function up(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerId !== pointer.current) return
    pointer.current = null
    if (tool === 'eraser') {
      if (trail.length) {
        const next: Stroke[] = []
        for (const stroke of history.strokes) {
          const scaled = { ...stroke, points: stroke.points.map(([x, y]) => [x * VIEW_W, y * VIEW_H] as [number, number]) }
          for (const part of eraseFromStroke(scaled, trail, ERASER)) {
            next.push({ ...part, points: part.points.map(([x, y]) => [x / VIEW_W, y / VIEW_H] as [number, number]) })
          }
        }
        publish(next)
      }
      setTrail([])
      return
    }
    if (live?.points.length) publish([...history.strokes, live])
    setLive(null)
  }

  const shown = live ? [...history.strokes, live] : history.strokes

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-[18px] bg-paper hairline">
        <svg
          ref={svg}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block aspect-[4/3] w-full touch-none select-none"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          role="img"
          aria-label={t('sketch.title')}
        >
          {shown.length === 0 && trail.length === 0 ? (
            <text x={VIEW_W / 2} y={VIEW_H / 2} textAnchor="middle" fontSize="34" fill="var(--wj-ink-3)">
              {t('sketch.empty')}
            </text>
          ) : null}
          {shown.map((stroke, index) => (
            <path
              key={stroke.id ?? index}
              d={pathOf(stroke.points)}
              fill="none"
              stroke={strokeColour(stroke.color)}
              strokeWidth={stroke.width}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {trail.length ? (
            <path
              d={pathOf(trail.map(([x, y]) => [x / VIEW_W, y / VIEW_H]))}
              fill="none"
              stroke="var(--wj-ink-3)"
              strokeOpacity={0.2}
              strokeWidth={ERASER * 2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </svg>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex rounded-full bg-well p-[3px]">
          {(['pen', 'eraser'] as const).map((value) => (
            <IconButton
              key={value}
              size="sm"
              label={t(`sketch.${value}`)}
              aria-pressed={tool === value}
              onClick={() => setTool(value)}
              className={cn(tool === value ? 'bg-leaf text-accent shadow-sm' : 'text-ink-2')}
            >
              {value === 'pen' ? <PenIcon size={19} /> : <EraserIcon size={19} />}
            </IconButton>
          ))}
        </div>
        <div className="ml-auto flex items-center">
          <IconButton label={t('format.undo')} disabled={!history.canUndo} onClick={() => onChange(history.undo())}>
            <UndoIcon size={21} />
          </IconButton>
          <IconButton label={t('format.redo')} disabled={!history.canRedo} onClick={() => onChange(history.redo())}>
            <RedoIcon size={21} />
          </IconButton>
          <IconButton label={t('sketch.clear')} disabled={shown.length === 0} onClick={() => setConfirmClear(true)}>
            <TrashIcon size={21} />
          </IconButton>
        </div>
      </div>

      <div className={cn('flex items-center gap-3 transition-opacity', tool === 'eraser' && 'pointer-events-none opacity-35')}>
        <div className="flex flex-1 items-center justify-between" role="radiogroup" aria-label={t('sketch.colour')}>
          {COLOURS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              role="radio"
              aria-checked={colour === swatch}
              aria-label={swatch === 'ink' ? t('format.inkDefault') : swatch}
              onClick={() => setColour(swatch)}
              className="press flex size-10 items-center justify-center rounded-full"
            >
              <span
                className={cn(
                  'size-7 rounded-full transition-shadow',
                  colour === swatch && 'shadow-[0_0_0_2px_var(--wj-leaf),0_0_0_4px_var(--wj-accent)]',
                )}
                style={{ background: strokeColour(swatch) }}
              />
            </button>
          ))}
        </div>
        <div className="flex rounded-full bg-well p-[3px]" role="radiogroup" aria-label={t('sketch.width')}>
          {WIDTHS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={width === value}
              aria-label={String(value)}
              onClick={() => setWidth(value)}
              className={cn('flex size-9 items-center justify-center rounded-full', width === value && 'bg-leaf shadow-sm')}
            >
              <span className="rounded-full bg-ink" style={{ width: 3 + value / 1.6, height: 3 + value / 1.6 }} />
            </button>
          ))}
        </div>
      </div>

      <ConfirmSheet
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title={t('sketch.clearTitle')}
        body={t('sketch.clearBody')}
        confirmLabel={t('sketch.clear')}
        destructive
        onConfirm={() => {
          setConfirmClear(false)
          history.beginChange()
          publish([])
        }}
      />
    </div>
  )
}
