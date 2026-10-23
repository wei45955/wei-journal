import { useCallback, useRef, useState } from 'react'
import type { Stroke } from '../../lib/types'

let counter = 0
function nextId(): string {
  counter += 1
  return `s${counter}-${Math.random().toString(36).slice(2, 8)}`
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function underEraser(x: number, y: number, eraser: Array<[number, number]>, radius: number): boolean {
  if (eraser.length === 1) return Math.hypot(x - eraser[0][0], y - eraser[0][1]) <= radius
  for (let i = 1; i < eraser.length; i += 1) {
    const [ax, ay] = eraser[i - 1]
    const [bx, by] = eraser[i]
    if (distanceToSegment(x, y, ax, ay, bx, by) <= radius) return true
  }
  return false
}

/** Whether any point of the stroke lies under the eraser path. */
export function strokeTouches(stroke: Stroke, eraser: Array<[number, number]>, radius: number): boolean {
  return stroke.points.some(([x, y]) => underEraser(x, y, eraser, radius))
}

/**
 * Removes the part of a stroke the eraser passed over. The stroke is split
 * into the runs the eraser missed, so the drawing stays vector and editable.
 */
export function eraseFromStroke(stroke: Stroke, eraser: Array<[number, number]>, radius: number): Stroke[] {
  if (!strokeTouches(stroke, eraser, radius)) return [stroke]
  const runs: Array<Array<[number, number]>> = []
  let current: Array<[number, number]> = []
  for (const point of stroke.points) {
    if (underEraser(point[0], point[1], eraser, radius)) {
      if (current.length > 1) runs.push(current)
      current = []
    } else {
      current.push(point)
    }
  }
  if (current.length > 1) runs.push(current)
  return runs.map((points) => ({ ...stroke, id: nextId(), points }))
}

/** The strokes with an undo and redo history. Undo and redo return the new state. */
export function useStrokeHistory(initial: Stroke[] = []) {
  const [strokes, setState] = useState<Stroke[]>(initial)
  const current = useRef(initial)
  const past = useRef<Stroke[][]>([])
  const future = useRef<Stroke[][]>([])
  const [, bump] = useState(0)

  const set = useCallback((next: Stroke[]) => {
    current.current = next
    setState(next)
  }, [])

  const beginChange = useCallback(() => {
    past.current = [...past.current.slice(-49), current.current]
    future.current = []
    bump((value) => value + 1)
  }, [])

  const undo = useCallback((): Stroke[] => {
    const previous = past.current.pop()
    if (!previous) return current.current
    future.current = [current.current, ...future.current].slice(0, 50)
    set(previous)
    bump((value) => value + 1)
    return previous
  }, [set])

  const redo = useCallback((): Stroke[] => {
    const [next, ...rest] = future.current
    if (!next) return current.current
    future.current = rest
    past.current = [...past.current, current.current].slice(-50)
    set(next)
    bump((value) => value + 1)
    return next
  }, [set])

  return {
    strokes,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    beginChange,
    setStrokes: set,
    undo,
    redo,
  }
}
