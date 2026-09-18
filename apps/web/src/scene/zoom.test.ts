import {
  MAX_ZOOM,
  MIN_ZOOM,
  asBoardId,
  asObjectId,
  asOrderKey,
  createDefaultRegistry,
  createEmptyDocument,
} from '@openframe/core'
import type { AnyOpenFrameObject, BoardDocument, ObjectId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import {
  fitToDocument,
  fitToObjects,
  nextZoomIn,
  nextZoomOut,
  sliderToZoom,
  viewportForBounds,
  ZOOM_STEPS,
  zoomAtCentre,
  zoomToSlider,
  panToReveal,
} from './zoom.js'

const registry = createDefaultRegistry()

function obj(id: string, x: number, y: number, w = 100, h = 100): AnyOpenFrameObject {
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

function docWith(...objects: AnyOpenFrameObject[]): BoardDocument {
  const map = new Map<ObjectId, AnyOpenFrameObject>()
  for (const o of objects) map.set(o.id, o)
  return { ...createEmptyDocument(asBoardId('b'), 'b', 0), objects: map }
}

describe('zoom steps', () => {
  it('moves to the next stop up and down', () => {
    expect(nextZoomIn(1)).toBe(2)
    expect(nextZoomOut(1)).toBe(0.5)
  })

  /**
   * Every stop is a percentage someone would say out loud. The readout beside
   * the slider shows this number directly, and landing on 75% or 300% reads as
   * having arrived somewhere by accident rather than having chosen it.
   */
  it('stops only on round percentages', () => {
    const readable = new Set([5, 10, 25, 50, 100, 200, 400, 800, 1600])
    for (const step of ZOOM_STEPS) {
      expect(readable.has(Math.round(step * 100)), `${String(step * 100)}% is not a round stop`).toBe(
        true,
      )
    }
  })

  it('stops at the limits rather than running away', () => {
    expect(nextZoomIn(MAX_ZOOM)).toBe(MAX_ZOOM)
    expect(nextZoomOut(MIN_ZOOM)).toBe(MIN_ZOOM)
  })

  it('lands on a stop from an arbitrary zoom', () => {
    expect(nextZoomIn(0.83)).toBe(1)
    expect(nextZoomOut(0.83)).toBe(0.5)
  })
})

/**
 * A linear slider would spend half its travel between 8x and 16x and cram
 * everything from 5% to 100% into the first third. Zoom is perceptually
 * multiplicative, so the mapping has to be.
 */
describe('slider mapping', () => {
  it('round-trips', () => {
    for (const zoom of [0.05, 0.5, 1, 4, 16]) {
      expect(sliderToZoom(zoomToSlider(zoom))).toBeCloseTo(zoom, 6)
    }
  })

  it('puts the ends at the ends', () => {
    expect(sliderToZoom(0)).toBeCloseTo(MIN_ZOOM, 6)
    expect(sliderToZoom(1)).toBeCloseTo(MAX_ZOOM, 6)
  })

  it('is logarithmic, not linear', () => {
    // Midpoint of a log scale over 0.05..16 is ~0.894, far from the linear 8.03.
    expect(sliderToZoom(0.5)).toBeLessThan(2)
  })

  it('clamps out-of-range positions', () => {
    expect(sliderToZoom(-5)).toBeCloseTo(MIN_ZOOM, 6)
    expect(sliderToZoom(9)).toBeCloseTo(MAX_ZOOM, 6)
  })
})

describe('zoom about the centre', () => {
  it('keeps the centre of the screen fixed', () => {
    const before = { x: 0, y: 0, zoom: 1 }
    const centreBefore = { x: before.x + 800 / 2, y: before.y + 600 / 2 }
    const after = zoomAtCentre(before, 800, 600, 4)
    const centreAfter = { x: after.x + 800 / after.zoom / 2, y: after.y + 600 / after.zoom / 2 }
    expect(centreAfter.x).toBeCloseTo(centreBefore.x, 6)
    expect(centreAfter.y).toBeCloseTo(centreBefore.y, 6)
  })
})

describe('fitting', () => {
  it('frames content with a margin', () => {
    const viewport = viewportForBounds({ x: 0, y: 0, width: 1000, height: 500 }, 800, 600, 50)
    expect(viewport.zoom).toBeLessThan(1)
    expect(viewport.zoom).toBeGreaterThan(0)
  })

  it('centres what it frames', () => {
    const bounds = { x: 100, y: 200, width: 400, height: 400 }
    const viewport = viewportForBounds(bounds, 800, 600, 0)
    const centreX = viewport.x + 800 / viewport.zoom / 2
    expect(centreX).toBeCloseTo(bounds.x + bounds.width / 2, 6)
  })

  it('fits the whole board', () => {
    const viewport = fitToDocument(docWith(obj('a', 0, 0), obj('b', 900, 400)), registry, 800, 600)
    expect(viewport).not.toBeNull()
  })

  /** An empty board has nothing to frame; guessing a viewport would be worse. */
  it('returns null for an empty board', () => {
    expect(fitToDocument(docWith(), registry, 800, 600)).toBeNull()
  })

  it('returns null when nothing is selected', () => {
    expect(fitToObjects(docWith(obj('a', 0, 0)), registry, [], 800, 600)).toBeNull()
  })

  it('frames only the selection', () => {
    const doc = docWith(obj('a', 0, 0), obj('far', 10_000, 10_000))
    const all = fitToDocument(doc, registry, 800, 600)
    const one = fitToObjects(doc, registry, [asObjectId('a')], 800, 600)
    expect(one?.zoom).toBeGreaterThan(all?.zoom ?? 0)
  })

  it('ignores hidden objects when fitting', () => {
    const doc = docWith(obj('a', 0, 0), { ...obj('ghost', 9000, 9000), hidden: true })
    const fitted = fitToDocument(doc, registry, 800, 600)
    const onlyVisible = fitToObjects(doc, registry, [asObjectId('a')], 800, 600)
    expect(fitted?.zoom).toBeCloseTo(onlyVisible?.zoom ?? 0, 6)
  })
})

describe('revealing an object without reframing the board', () => {
  const view = { x: 0, y: 0, zoom: 1 }

  it('leaves an already visible object alone, by identity', () => {
    const same = panToReveal(view, { x: 100, y: 100, width: 50, height: 50 }, 1000, 800)
    // Identity, not equality: a new object would be a pointless store write and
    // a re-render on every reveal of something already on screen.
    expect(same).toBe(view)
  })

  it('pans up for something above the window, by the minimum', () => {
    const moved = panToReveal(view, { x: 100, y: -200, width: 100, height: 100 }, 1000, 800, 48)
    expect(moved.y).toBe(-248)
    expect(moved.x).toBe(0)
    // Zoom is the user's, and a reveal does not get to change it.
    expect(moved.zoom).toBe(1)
  })

  it('pans right for something past the right edge, by the minimum', () => {
    const moved = panToReveal(view, { x: 1200, y: 100, width: 100, height: 100 }, 1000, 800, 48)
    // Right edge at 1300 + 48 margin = 1348, minus the 1000 visible.
    expect(moved.x).toBe(348)
    expect(moved.y).toBe(0)
  })

  it('shows the near edge of something larger than the window', () => {
    const moved = panToReveal(view, { x: -500, y: -500, width: 5000, height: 5000 }, 1000, 800, 48)
    expect(moved.x).toBe(-548)
    expect(moved.y).toBe(-548)
  })

  /** The margin is in SCREEN pixels, so it must not grow when zoomed out. */
  it('keeps the margin constant on screen at any zoom', () => {
    const zoomed = { x: 0, y: 0, zoom: 0.5 }
    const moved = panToReveal(zoomed, { x: 100, y: -200, width: 100, height: 100 }, 1000, 800, 48)
    // 48 screen pixels is 96 world units at 0.5.
    expect(moved.y).toBe(-296)
  })

  it('does not move an axis that was already fine', () => {
    const moved = panToReveal(view, { x: 100, y: -200, width: 100, height: 100 }, 1000, 800)
    expect(moved.x).toBe(view.x)
  })
})
