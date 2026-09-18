import { asObjectId, asOrderKey, type AnyOpenFrameObject } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { angleFrom, framesBounds, resizeBounds, scaleFrames, snapAngle } from './resize.js'

const bounds = { x: 100, y: 100, width: 200, height: 100 }

function obj(id: string, x: number, y: number, w: number, h: number): AnyOpenFrameObject {
  return {
    id: asObjectId(id),
    type: 'sticky',
    dataVersion: 1,
    frame: { x, y, width: w, height: h, rotation: 0 },
    parentId: null,
    order: asOrderKey('a0'),
    style: {},
    locked: false,
    hidden: false,
    data: { text: '' },
    meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
  }
}

describe('resizeBounds', () => {
  it('grows from the south-east corner without moving the origin', () => {
    expect(resizeBounds(bounds, 'se', { x: 50, y: 25 })).toEqual({
      x: 100,
      y: 100,
      width: 250,
      height: 125,
    })
  })

  it('moves the origin when dragging the north-west corner', () => {
    expect(resizeBounds(bounds, 'nw', { x: 20, y: 10 })).toEqual({
      x: 120,
      y: 110,
      width: 180,
      height: 90,
    })
  })

  it('constrains an edge handle to its own axis', () => {
    const resized = resizeBounds(bounds, 'e', { x: 40, y: 999 })
    expect(resized.height).toBe(bounds.height)
    expect(resized.width).toBe(240)
  })

  it('constrains a north handle to the vertical axis', () => {
    const resized = resizeBounds(bounds, 'n', { x: 999, y: 20 })
    expect(resized.width).toBe(bounds.width)
    expect(resized.y).toBe(120)
  })

  /** Dragging past the opposite edge should flip, not collapse to nothing. */
  it('flips rather than collapsing when dragged through', () => {
    const resized = resizeBounds(bounds, 'e', { x: -300, y: 0 })
    expect(resized.width).toBeGreaterThan(0)
    expect(resized.x).toBeLessThan(bounds.x)
  })

  it('never goes below the minimum size', () => {
    const resized = resizeBounds(bounds, 'se', { x: -199, y: -99 })
    expect(resized.width).toBeGreaterThanOrEqual(8)
    expect(resized.height).toBeGreaterThanOrEqual(8)
  })

  it('preserves aspect ratio on a corner when asked', () => {
    const resized = resizeBounds(bounds, 'se', { x: 100, y: 0 }, { preserveAspect: true })
    expect(resized.width / resized.height).toBeCloseTo(bounds.width / bounds.height, 6)
  })

  it('resizes about the centre when asked', () => {
    const resized = resizeBounds(bounds, 'e', { x: 25, y: 0 }, { fromCentre: true })
    const centreBefore = bounds.x + bounds.width / 2
    expect(resized.x + resized.width / 2).toBeCloseTo(centreBefore, 6)
    expect(resized.width).toBe(250)
  })

  it('leaves the rect alone for a zero drag', () => {
    expect(resizeBounds(bounds, 'se', { x: 0, y: 0 })).toEqual(bounds)
  })
})

describe('framesBounds', () => {
  it('returns null for nothing', () => {
    expect(framesBounds([])).toBeNull()
  })

  it('encloses every frame', () => {
    expect(framesBounds([obj('a', 0, 0, 100, 100), obj('b', 200, 50, 100, 100)])).toEqual({
      x: 0,
      y: 0,
      width: 300,
      height: 150,
    })
  })
})

/**
 * What makes resizing a multi-selection feel like resizing one object: every
 * member keeps its relative position and proportion inside the group.
 */
describe('scaleFrames', () => {
  const objects = [obj('a', 0, 0, 100, 100), obj('b', 100, 100, 100, 100)]
  const from = { x: 0, y: 0, width: 200, height: 200 }

  it('is identity for an unchanged box', () => {
    const scaled = scaleFrames(objects, from, from)
    expect(scaled[0]?.frame).toMatchObject({ x: 0, y: 0, width: 100, height: 100 })
    expect(scaled[1]?.frame).toMatchObject({ x: 100, y: 100, width: 100, height: 100 })
  })

  it('doubles proportionally', () => {
    const scaled = scaleFrames(objects, from, { x: 0, y: 0, width: 400, height: 400 })
    expect(scaled[0]?.frame).toMatchObject({ x: 0, y: 0, width: 200, height: 200 })
    expect(scaled[1]?.frame).toMatchObject({ x: 200, y: 200, width: 200, height: 200 })
  })

  it('translates when the box moves', () => {
    const scaled = scaleFrames(objects, from, { x: 50, y: 50, width: 200, height: 200 })
    expect(scaled[0]?.frame).toMatchObject({ x: 50, y: 50 })
  })

  it('preserves each object rotation', () => {
    const rotated = [
      {
        ...obj('a', 0, 0, 100, 100),
        frame: { x: 0, y: 0, width: 100, height: 100, rotation: 1.2 },
      },
    ]
    const scaled = scaleFrames(rotated, from, { x: 0, y: 0, width: 400, height: 400 })
    expect(scaled[0]?.frame.rotation).toBe(1.2)
  })
})

describe('rotation helpers', () => {
  it('measures the angle from a centre', () => {
    expect(angleFrom({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeCloseTo(0, 10)
    expect(angleFrom({ x: 0, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 10)
  })

  it('passes the angle through when not snapping', () => {
    expect(snapAngle(0.37, false)).toBe(0.37)
  })

  it('snaps to 15 degree steps', () => {
    const step = Math.PI / 12
    expect(snapAngle(step * 2.4, true)).toBeCloseTo(step * 2, 10)
    expect(snapAngle(step * 2.6, true)).toBeCloseTo(step * 3, 10)
  })
})
