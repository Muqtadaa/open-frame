import { describe, expect, it } from 'vitest'

import { createEmptyDocument, type BoardDocument } from './document.js'
import { asBoardId, asObjectId, asOrderKey, type ObjectId } from './ids.js'
import { findParentCycle, repairDocument, wouldCreateCycle } from './invariants.js'
import type { AnyOpenFrameObject } from './object.js'

function obj(id: string, parentId: string | null): AnyOpenFrameObject {
  return {
    id: asObjectId(id),
    type: 'sticky',
    dataVersion: 1,
    frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
    parentId: parentId === null ? null : asObjectId(parentId),
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

describe('cycle detection', () => {
  it('finds no cycle in a well-formed hierarchy', () => {
    const doc = docWith(obj('a', null), obj('b', 'a'), obj('c', 'b'))
    expect(findParentCycle(doc.objects, asObjectId('c'))).toBeNull()
  })

  it('finds a cycle', () => {
    const doc = docWith(obj('a', 'b'), obj('b', 'a'))
    expect(findParentCycle(doc.objects, asObjectId('a'))).not.toBeNull()
  })

  it('predicts a cycle before a reparent creates one', () => {
    const doc = docWith(obj('a', null), obj('b', 'a'), obj('c', 'b'))
    expect(wouldCreateCycle(doc.objects, asObjectId('a'), asObjectId('c'))).toBe(true)
    expect(wouldCreateCycle(doc.objects, asObjectId('a'), null)).toBe(false)
    expect(wouldCreateCycle(doc.objects, asObjectId('a'), asObjectId('a'))).toBe(true)
  })
})

describe('document repair', () => {
  it('returns the same document when nothing is wrong', () => {
    const doc = docWith(obj('a', null), obj('b', 'a'))
    const { document, repairs } = repairDocument(doc)
    expect(repairs).toEqual([])
    expect(document).toBe(doc)
  })

  it('detaches an object that is its own parent', () => {
    const { document, repairs } = repairDocument(docWith(obj('a', 'a')))
    expect(repairs[0]?.kind).toBe('self-parent')
    expect(document.objects.get(asObjectId('a'))?.parentId).toBeNull()
  })

  it('detaches an object whose parent does not exist', () => {
    const { document, repairs } = repairDocument(docWith(obj('a', 'ghost')))
    expect(repairs[0]?.kind).toBe('dangling-parent')
    expect(document.objects.get(asObjectId('a'))?.parentId).toBeNull()
  })

  /**
   * The corruption concurrent editing can create on its own: two users
   * reparenting in opposite directions at the same moment. The repair must be
   * DETERMINISTIC so that two clients independently reach the same result.
   */
  it('breaks a parent cycle deterministically', () => {
    const first = repairDocument(docWith(obj('a', 'b'), obj('b', 'a')))
    const second = repairDocument(docWith(obj('b', 'a'), obj('a', 'b')))

    expect(first.repairs.some((r) => r.kind === 'detached-cycle')).toBe(true)
    expect(findParentCycle(first.document.objects, asObjectId('a'))).toBeNull()
    expect(findParentCycle(first.document.objects, asObjectId('b'))).toBeNull()

    const detachedFirst = first.repairs.find((r) => r.kind === 'detached-cycle')?.objectId
    const detachedSecond = second.repairs.find((r) => r.kind === 'detached-cycle')?.objectId
    expect(detachedFirst).toBe(detachedSecond)
  })

  it('resets a non-finite frame instead of dropping the object', () => {
    const broken = {
      ...obj('a', null),
      frame: { x: Number.NaN, y: 0, width: 10, height: 10, rotation: 0 },
    }
    const { document, repairs } = repairDocument(docWith(broken))
    expect(repairs[0]?.kind).toBe('non-finite-frame')
    expect(document.objects.get(asObjectId('a'))?.frame.x).toBe(0)
  })
})
