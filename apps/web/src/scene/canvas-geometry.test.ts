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
