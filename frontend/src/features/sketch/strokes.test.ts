import { describe, expect, it } from 'vitest'
import { eraseFromStroke, strokeTouches } from './strokes'
import type { Stroke } from '../../lib/types'

const stroke: Stroke = {
  id: 'a',
  color: '#000000',
  width: 4,
  points: [
    [0, 0.5],
    [0.25, 0.5],
    [0.5, 0.5],
    [0.75, 0.5],
    [1, 0.5],
  ],
}

describe('strokeTouches', () => {
  it('detects a stroke the eraser passed over', () => {
    expect(strokeTouches(stroke, [[0.5, 0.4], [0.5, 0.6]], 0.05)).toBe(true)
  })

  it('leaves a stroke the eraser missed alone', () => {
    expect(strokeTouches(stroke, [[0.5, 0.05], [0.5, 0.15]], 0.05)).toBe(false)
  })

  it('handles a single tap of the eraser', () => {
    expect(strokeTouches(stroke, [[0.25, 0.5]], 0.05)).toBe(true)
    expect(strokeTouches(stroke, [[0.25, 0.9]], 0.05)).toBe(false)
  })
})

describe('eraseFromStroke', () => {
  it('keeps the drawing vector by splitting the stroke', () => {
    const parts = eraseFromStroke(stroke, [[0.5, 0.4], [0.5, 0.6]], 0.05)
    expect(parts.length).toBe(2)
    expect(parts[0].points).toEqual([
      [0, 0.5],
      [0.25, 0.5],
    ])
    expect(parts[1].points).toEqual([
      [0.75, 0.5],
      [1, 0.5],
    ])
  })

  it('keeps the colour and the width of the original stroke', () => {
    const parts = eraseFromStroke(stroke, [[0.5, 0.4], [0.5, 0.6]], 0.05)
    for (const part of parts) {
      expect(part.color).toBe(stroke.color)
      expect(part.width).toBe(stroke.width)
    }
  })

  it('gives every part its own identifier', () => {
    const parts = eraseFromStroke(stroke, [[0.5, 0.4], [0.5, 0.6]], 0.05)
    const ids = new Set(parts.map((part) => part.id))
    expect(ids.size).toBe(parts.length)
  })

  it('removes the stroke entirely when the eraser covers all of it', () => {
    const parts = eraseFromStroke(stroke, [[0, 0.4], [1, 0.6]], 0.05)
    expect(parts.length).toBe(0)
  })

  it('leaves the stroke alone when the eraser missed it', () => {
    const parts = eraseFromStroke(stroke, [[0, 0.05], [1, 0.15]], 0.05)
    expect(parts.length).toBe(1)
    expect(parts[0].points).toEqual(stroke.points)
  })
})
