import { describe, expect, it, vi } from 'vitest'

import { createEmptyDocument } from '../domain/document.js'
import { asBoardId, asObjectId, asOrderKey } from '../domain/ids.js'
import type { AnyOpenFrameObject } from '../domain/object.js'
import { createDocumentStore } from './document-store.js'

function sticky(id: string): AnyOpenFrameObject {
  return {
    id: asObjectId(id),
    type: 'sticky',
    dataVersion: 1,
    frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
    parentId: null,
    order: asOrderKey('a0'),
    style: {},
    locked: false,
    hidden: false,
    data: { text: '' },
    meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
  }
}

function harness() {
  return createDocumentStore(createEmptyDocument(asBoardId('b'), 'b', 0))
}

describe('document store', () => {
  it('starts at version zero and advances on change', () => {
    const { store, writer } = harness()
    expect(store.getVersion()).toBe(0)
    writer.applyPatches([{ op: 'add', id: asObjectId('a'), object: sticky('a') }])
    expect(store.getVersion()).toBe(1)
  })

  it('ignores an empty patch list entirely', () => {
    const { store, writer } = harness()
    const listener = vi.fn()
    store.subscribeToDocument(listener)
    writer.applyPatches([])
    expect(listener).not.toHaveBeenCalled()
    expect(store.getVersion()).toBe(0)
  })

  /**
   * The performance-critical behaviour: a change to one object must not wake
   * every other subscribed object. With a flat listener list this would be
   * O(objects) work per pointer-up — the shape of bug that makes a canvas feel
   * slow only once a board gets big, which is the worst time to discover it.
   */
  it('notifies only the objects that actually changed', () => {
    const { store, writer } = harness()
    writer.applyPatches([
      { op: 'add', id: asObjectId('a'), object: sticky('a') },
      { op: 'add', id: asObjectId('b'), object: sticky('b') },
    ])

    const onA = vi.fn()
    const onB = vi.fn()
    store.subscribeToObject(asObjectId('a'), onA)
    store.subscribeToObject(asObjectId('b'), onB)

    writer.applyPatches([{ op: 'set', id: asObjectId('a'), path: ['frame', 'x'], value: 5 }])

    expect(onA).toHaveBeenCalledTimes(1)
    expect(onB).not.toHaveBeenCalled()
  })

  it('notifies structure subscribers only when objects appear or disappear', () => {
    const { store, writer } = harness()
    const onStructure = vi.fn()
    store.subscribeToStructure(onStructure)

    writer.applyPatches([{ op: 'add', id: asObjectId('a'), object: sticky('a') }])
    expect(onStructure).toHaveBeenCalledTimes(1)

    writer.applyPatches([{ op: 'set', id: asObjectId('a'), path: ['frame', 'x'], value: 1 }])
    expect(onStructure).toHaveBeenCalledTimes(1)

    writer.applyPatches([{ op: 'remove', id: asObjectId('a') }])
    expect(onStructure).toHaveBeenCalledTimes(2)
  })

  it('stops notifying after unsubscribe', () => {
    const { store, writer } = harness()
    writer.applyPatches([{ op: 'add', id: asObjectId('a'), object: sticky('a') }])
    const listener = vi.fn()
    const unsubscribe = store.subscribeToObject(asObjectId('a'), listener)
    unsubscribe()
    writer.applyPatches([{ op: 'set', id: asObjectId('a'), path: ['frame', 'x'], value: 1 }])
    expect(listener).not.toHaveBeenCalled()
  })

  it('returns a stable object reference until that object changes', () => {
    const { store, writer } = harness()
    writer.applyPatches([
      { op: 'add', id: asObjectId('a'), object: sticky('a') },
      { op: 'add', id: asObjectId('b'), object: sticky('b') },
    ])
    const bBefore = store.getObject(asObjectId('b'))
    writer.applyPatches([{ op: 'set', id: asObjectId('a'), path: ['frame', 'x'], value: 9 }])
    expect(store.getObject(asObjectId('b'))).toBe(bBefore)
  })

  it('wakes every subscriber when the whole document is replaced', () => {
    const { store, writer } = harness()
    writer.applyPatches([{ op: 'add', id: asObjectId('a'), object: sticky('a') }])
    const listener = vi.fn()
    store.subscribeToObject(asObjectId('a'), listener)
    writer.replaceDocument(createEmptyDocument(asBoardId('other'), 'other', 0))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getDocument().id).toBe(asBoardId('other'))
  })
})
