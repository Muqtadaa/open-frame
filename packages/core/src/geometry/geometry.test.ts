import { describe, expect, it } from 'vitest'

import { distance, point } from './point.js'
import { contains, containsPoint, intersects, rectFromPoints, union, unionAll } from './rect.js'
import {
  DEFAULT_VIEWPORT,
  clampZoom,
  panViewport,
  screenToWorld,
  visibleWorldRect,
  worldToScreen,
  zoomAtScreenPoint,
} from './viewport.js'

describe('point', () => {
  it('measures distance', () => {
    expect(distance(point(0, 0), point(3, 4))).toBe(5)
  })
})

describe('rect', () => {
  it('normalises corners in any order', () => {
    expect(rectFromPoints(point(10, 10), point(0, 4))).toEqual({
      x: 0,
      y: 4,
      width: 10,
      height: 6,
    })
  })

  it('detects containment of a point', () => {
    const r = { x: 0, y: 0, width: 10, height: 10 }
    expect(containsPoint(r, point(5, 5))).toBe(true)
    expect(containsPoint(r, point(11, 5))).toBe(false)
    expect(containsPoint(r, point(10, 10))).toBe(true)
  })

  it('detects intersection including edge contact', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 }
    expect(intersects(a, { x: 5, y: 5, width: 10, height: 10 })).toBe(true)
    expect(intersects(a, { x: 10, y: 0, width: 5, height: 5 })).toBe(true)
    expect(intersects(a, { x: 11, y: 0, width: 5, height: 5 })).toBe(false)
  })

  it('distinguishes full containment from intersection', () => {
    const outer = { x: 0, y: 0, width: 100, height: 100 }
    const straddling = { x: 90, y: 0, width: 50, height: 10 }
    expect(intersects(outer, straddling)).toBe(true)
    expect(contains(outer, straddling)).toBe(false)
    expect(contains(outer, { x: 10, y: 10, width: 10, height: 10 })).toBe(true)
  })

  it('unions rects', () => {
    expect(
      union({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 10, height: 10 }),
    ).toEqual({ x: 0, y: 0, width: 30, height: 15 })
  })

  it('returns null for the union of nothing', () => {
    expect(unionAll([])).toBeNull()
  })
})

describe('viewport', () => {
  it('round-trips screen and world coordinates', () => {
    const viewport = { x: 120, y: -40, zoom: 1.75 }
    const original = point(37, 913)
    const roundTripped = worldToScreen(viewport, screenToWorld(viewport, original))
    expect(roundTripped.x).toBeCloseTo(original.x, 10)
    expect(roundTripped.y).toBeCloseTo(original.y, 10)
  })

  it('keeps the anchored world point fixed while zooming', () => {
    const viewport = { x: 0, y: 0, zoom: 1 }
    const anchor = point(400, 300)
    const worldBefore = screenToWorld(viewport, anchor)
    const zoomed = zoomAtScreenPoint(viewport, anchor, 3)
    const worldAfter = screenToWorld(zoomed, anchor)
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 10)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 10)
  })

  it('clamps zoom to the supported range', () => {
    expect(clampZoom(1000)).toBe(16)
    expect(clampZoom(0)).toBe(0.05)
  })

  it('reports a larger visible world rect when zoomed out', () => {
    const zoomedOut = visibleWorldRect({ x: 0, y: 0, zoom: 0.5 }, 800, 600)
    expect(zoomedOut).toEqual({ x: 0, y: 0, width: 1600, height: 1200 })
  })

  it('pans in world units scaled by zoom', () => {
    const panned = panViewport({ ...DEFAULT_VIEWPORT, zoom: 2 }, 100, 50)
    expect(panned).toEqual({ x: -50, y: -25, zoom: 2 })
  })
})
