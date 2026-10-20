import { useCallback, useRef, useState } from 'react'
import type { Stroke } from '../../lib/types'

/** The tools the drawing canvas offers. */
export type DrawingTool = 'pen' | 'eraser'

export interface DrawingHistory {
  strokes: Stroke[]
  canUndo: boolean
  canRedo: boolean
  /** Records the current state so the next change can be undone. */
  beginChange: () => void
  setStrokes: (strokes: Stroke[]) => void
  undo: () => void
  redo: () => void
  clear: () => void
}

let counter = 0
function nextId(): string {
  counter += 1
  return `s${counter}-${Math.random().toString(36).slice(2, 8)}`
}

/** Squared distance from a point to a segment. */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** True when a point of the stroke lies under the eraser path. */
function strokeTouches(stroke: Stroke, eraser: Array<[number, number]>, radius: number): boolean {
  for (const [x, y] of stroke.points) {
    for (let i = 1; i < eraser.length; i++) {
      const [ax, ay] = eraser[i - 1]
      const [bx, by] = eraser[i]
      if (distanceToSegment(x, y, ax, ay, bx, by) <= radius) return true
    }
    if (eraser.length === 1) {
      const [ax, ay] = eraser[0]
      if (Math.hypot(x - ax, y - ay) <= radius) return true
    }
  }
  return false
}

/**
 * Removes the part of a stroke that the eraser passed over.
 *
 * The stroke is split into the runs the eraser missed, so the drawing keeps
 * its vector shape and stays editable.
 */
function eraseFromStroke(stroke: Stroke, eraser: Array<[number, number]>, radius: number): Stroke[] {
  const runs: Array<Array<[number, number]>> = []
  let current: Array<[number, number]> = []

  for (const point of stroke.points) {
    let erased = false
    for (let i = 1; i < eraser.length && !erased; i++) {
      const [ax, ay] = eraser[i - 1]
      const [bx, by] = eraser[i]
      if (distanceToSegment(point[0], point[1], ax, ay, bx, by) <= radius) erased = true
    }
    if (eraser.length === 1 && !erased) {
      const [ax, ay] = eraser[0]
      if (Math.hypot(point[0] - ax, point[1] - ay) <= radius) erased = true
    }
    if (erased) {
      if (current.length > 1) runs.push(current)
      current = []
    } else {
      current.push(point)
    }
  }
  if (current.length > 1) runs.push(current)

  return runs.map((points) => ({ ...stroke, id: nextId(), points }))
}

/** Keeps an undo and redo history of the drawing. */
export function useDrawing(initial: Stroke[] = []): DrawingHistory {
  const [strokes, setStrokesState] = useState<Stroke[]>(initial)
  const [past, setPast] = useState<Stroke[][]>([])
  const [future, setFuture] = useState<Stroke[][]>([])
  const strokesRef = useRef(strokes)
  strokesRef.current = strokes

  const beginChange = useCallback(() => {
    setPast((entries) => [...entries.slice(-49), strokesRef.current])
    setFuture([])
  }, [])

  const setStrokes = useCallback((next: Stroke[]) => {
    setStrokesState(next)
  }, [])

  const undo = useCallback(() => {
    setPast((entries) => {
      if (entries.length === 0) return entries
      const previous = entries[entries.length - 1]
      setFuture((pending) => [strokesRef.current, ...pending].slice(0, 50))
      setStrokesState(previous)
      return entries.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture((entries) => {
      if (entries.length === 0) return entries
      const next = entries[0]
      setPast((history) => [...history, strokesRef.current].slice(-50))
      setStrokesState(next)
      return entries.slice(1)
    })
  }, [])

  const clear = useCallback(() => {
    beginChange()
    setStrokes([])
  }, [beginChange])

  return {
    strokes,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    beginChange,
    setStrokes,
    undo,
    redo,
    clear,
  }
}

export { eraseFromStroke, strokeTouches }
