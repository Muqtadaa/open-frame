import { MAX_ZOOM, screenToWorld, worldToScreen, type Viewport } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { pinchViewport } from './pinch.js'

/**
 * Two fingers zoom and pan the board together (audit 2026-09-27, P1).
 *
 * What was under the fingers stays under them: the world point at their
 * starting midpoint lands at their current midpoint, and the zoom follows the
 * distance between them.
 */
describe('pinchViewport', () => {
  const start: Viewport = { x: 100, y: 50, zoom: 1 }
  const a = { x: 200, y: 300 }
  const b = { x: 400, y: 300 }

  it('spreading the fingers zooms about their midpoint', () => {
    const midpoint = { x: 300, y: 300 }
    const under = screenToWorld(start, midpoint)
    const next = pinchViewport({ viewport: start, a, b }, { x: 100, y: 300 }, { x: 500, y: 300 })
    expect(next.zoom).toBeCloseTo(2)
    const landed = worldToScreen(next, under)
    expect(landed.x).toBeCloseTo(midpoint.x)
    expect(landed.y).toBeCloseTo(midpoint.y)
  })

  it('moving both fingers together pans without zooming', () => {
    const under = screenToWorld(start, { x: 300, y: 300 })
    const next = pinchViewport({ viewport: start, a, b }, { x: 240, y: 340 }, { x: 440, y: 340 })
    expect(next.zoom).toBeCloseTo(1)
    const landed = worldToScreen(next, under)
    expect(landed.x).toBeCloseTo(340)
    expect(landed.y).toBeCloseTo(340)
  })

  it('stops at the zoom limits', () => {
    const next = pinchViewport(
      { viewport: start, a, b },
      { x: -100000, y: 300 },
      { x: 100000, y: 300 },
    )
    expect(next.zoom).toBe(MAX_ZOOM)
  })

  it('two fingers that started together do not divide by zero', () => {
    const next = pinchViewport({ viewport: start, a, b: a }, { x: 250, y: 300 }, { x: 260, y: 300 })
    expect(Number.isFinite(next.zoom)).toBe(true)
    expect(next.zoom).toBe(1)
  })
})
