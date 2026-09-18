import {
  asBoardId,
  asObjectId,
  asOrderKey,
  createDefaultRegistry,
  createEmptyDocument,
  type AnyOpenFrameObject,
  type BoardDocument,
  type ObjectId,
} from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { cullToViewport } from './culling.js'
import { hitTest, objectsInMarquee } from './hit-testing.js'

const registry = createDefaultRegistry()

function sticky(
  id: string,
  x: number,
  y: number,
  order: string,
  overrides: Partial<AnyOpenFrameObject> = {},
): AnyOpenFrameObject {
  return {
    id: asObjectId(id),
    type: 'sticky',
    dataVersion: 1,
    frame: { x, y, width: 100, height: 100, rotation: 0 },
    parentId: null,
    order: asOrderKey(order),
    style: {},
    locked: false,
    hidden: false,
    data: { text: '' },
    meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
    ...overrides,
  }
}

function docWith(...objects: AnyOpenFrameObject[]): BoardDocument {
  const map = new Map<ObjectId, AnyOpenFrameObject>()
  for (const o of objects) map.set(o.id, o)
  return { ...createEmptyDocument(asBoardId('b'), 'b', 0), objects: map }
}

describe('viewport culling', () => {
  const doc = docWith(
    sticky('near', 0, 0, 'a0'),
    sticky('far', 100_000, 100_000, 'a1'),
    sticky('hidden', 10, 10, 'a2', { hidden: true }),
  )

  it('keeps objects inside the viewport', () => {
    const visible = cullToViewport(doc, registry, { x: -50, y: -50, width: 500, height: 500 })
    expect(visible.map((o) => o.id)).toContain(asObjectId('near'))
  })

  /** The property the whole DOM-renderer strategy depends on. */
  it('drops objects far outside the viewport', () => {
    const visible = cullToViewport(doc, registry, { x: -50, y: -50, width: 500, height: 500 })
    expect(visible.map((o) => o.id)).not.toContain(asObjectId('far'))
  })

  it('never renders hidden objects', () => {
    const visible = cullToViewport(doc, registry, {
      x: -1000,
      y: -1000,
      width: 10_000,
      height: 10_000,
    })
    expect(visible.map((o) => o.id)).not.toContain(asObjectId('hidden'))
  })

  it('keeps just-offscreen objects when padded, so panning does not flicker', () => {
    const doc2 = docWith(sticky('edge', 520, 0, 'a0'))
    const region = { x: 0, y: 0, width: 500, height: 500 }
    expect(cullToViewport(doc2, registry, region)).toHaveLength(0)
    expect(cullToViewport(doc2, registry, region, 200)).toHaveLength(1)
  })

  it('returns objects in paint order', () => {
    const many = docWith(sticky('c', 0, 0, 'a2'), sticky('a', 0, 0, 'a0'), sticky('b', 0, 0, 'a1'))
    const visible = cullToViewport(many, registry, { x: -10, y: -10, width: 500, height: 500 })
    expect(visible.map((o) => o.id)).toEqual([asObjectId('a'), asObjectId('b'), asObjectId('c')])
  })
})

describe('hit testing', () => {
  it('finds the object under a point', () => {
    const doc = docWith(sticky('a', 0, 0, 'a0'))
    expect(hitTest(doc, registry, { x: 50, y: 50 })).toBe(asObjectId('a'))
  })

  it('returns null on empty canvas', () => {
    const doc = docWith(sticky('a', 0, 0, 'a0'))
    expect(hitTest(doc, registry, { x: 900, y: 900 })).toBeNull()
  })

  it('returns the topmost object when several overlap', () => {
    const doc = docWith(sticky('below', 0, 0, 'a0'), sticky('above', 0, 0, 'a1'))
    expect(hitTest(doc, registry, { x: 10, y: 10 })).toBe(asObjectId('above'))
  })

  it('ignores hidden objects', () => {
    const doc = docWith(sticky('a', 0, 0, 'a0', { hidden: true }))
    expect(hitTest(doc, registry, { x: 10, y: 10 })).toBeNull()
  })
})

describe('marquee selection', () => {
  const doc = docWith(sticky('inside', 10, 10, 'a0'), sticky('straddling', 450, 10, 'a1'))

  /** Brushing an object must not select it — only fully enclosing it does. */
  it('requires full containment rather than intersection', () => {
    const selected = objectsInMarquee(doc, registry, { x: 0, y: 0, width: 500, height: 500 })
    expect(selected).toEqual([asObjectId('inside')])
  })

  it('skips locked objects', () => {
    const locked = docWith(sticky('a', 10, 10, 'a0', { locked: true }))
    expect(objectsInMarquee(locked, registry, { x: 0, y: 0, width: 500, height: 500 })).toEqual([])
  })
})

/**
 * ADR 0011: a relation joins two objects and is not anywhere.
 *
 * Every one of these tests was run against the un-guarded code first (rule 23).
 * The marquee case is the dangerous one and it FAILED as expected: a relation's
 * frame is a zero-size box at the origin, so `contains` returns true for any
 * marquee that covers the origin — and for a degenerate box, for every marquee
 * anywhere. Dragging a selection box would silently pick up relations the user
 * cannot see, and the next Delete would destroy provenance with no visible
 * cause.
 */
describe('objects with no place on the board', () => {
  function relation(id: string, from: string, to: string): AnyOpenFrameObject {
    return {
      id: asObjectId(id),
      type: 'relation',
      dataVersion: 1,
      frame: { x: 0, y: 0, width: 0, height: 0, rotation: 0 },
      parentId: null,
      order: asOrderKey('a9'),
      style: {},
      locked: false,
      hidden: false,
      data: { from: asObjectId(from), to: asObjectId(to), predicate: 'cites' },
      meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
    }
  }

  const doc = docWith(
    sticky('a', 0, 0, 'a0'),
    sticky('b', 200, 0, 'a1'),
    relation('rel', 'a', 'b'),
  )

  it('is never culled into a viewport', () => {
    const visible = cullToViewport(doc, registry, { x: -500, y: -500, width: 2000, height: 2000 })
    expect(visible.map((o) => o.id)).not.toContain(asObjectId('rel'))
    // The spatial objects are still there — this is an exclusion, not a filter
    // that swallowed the board.
    expect(visible.map((o) => o.id)).toContain(asObjectId('a'))
  })

  it('is never hit by a click, even at the origin its frame claims', () => {
    expect(hitTest(doc, registry, { x: 0, y: 0 })).toBe(asObjectId('a'))
  })

  it('is never swept up by a marquee', () => {
    const selected = objectsInMarquee(doc, registry, {
      x: -500,
      y: -500,
      width: 2000,
      height: 2000,
    })
    expect(selected).not.toContain(asObjectId('rel'))
    expect(selected).toContain(asObjectId('a'))
    expect(selected).toContain(asObjectId('b'))
  })

  /*
   * This one passes with the guard removed, and is kept anyway as the control:
   * a relation's frame is degenerate but still POSITIONED, so a marquee far
   * from the origin excludes it on geometry alone. That is exactly why the
   * three tests above are the real ones — the bug only appears where the
   * marquee happens to cover the origin, which is where boards start and where
   * every "select all" drag begins.
   */
  it('is not selected by a marquee that selects nothing else', () => {
    const selected = objectsInMarquee(doc, registry, {
      x: 5000,
      y: 5000,
      width: 100,
      height: 100,
    })
    expect(selected).toEqual([])
  })
})
