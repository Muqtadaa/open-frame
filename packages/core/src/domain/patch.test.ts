import { describe, expect, it } from 'vitest'

import { createEmptyDocument } from './document.js'
import { asBoardId, asObjectId, asOrderKey } from './ids.js'
import type { ObjectId } from './ids.js'
import type { AnyOpenFrameObject } from './object.js'
import { applyPatches, invertPatches, PatchError, type Patch } from './patch.js'
import type { BoardDocument } from './document.js'

/** Core compiles without the DOM library, so `structuredClone` is not available. */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function makeObject(id: string, x = 0): AnyOpenFrameObject {
  return {
    id: asObjectId(id),
    type: 'sticky',
    dataVersion: 1,
    frame: { x, y: 0, width: 100, height: 100, rotation: 0 },
    parentId: null,
    order: asOrderKey('a0'),
    style: {},
    locked: false,
    hidden: false,
    data: { text: id },
    meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
  }
}

function docWith(...objects: AnyOpenFrameObject[]): BoardDocument {
  const doc = createEmptyDocument(asBoardId('b'), 'b', 0)
  const map = new Map<ObjectId, AnyOpenFrameObject>()
  for (const object of objects) map.set(object.id, object)
  return { ...doc, objects: map }
}

/**
 * THE architectural test for undo.
 *
 * Every command's undo behaviour reduces to this property, which is why there
 * is no separate "does undo work" test per command: if applying a patch list
 * and then its inverse always returns the exact prior document, then undo is
 * correct for every command that exists now and every command added later.
 */
describe('patch inversion', () => {
  const cases: { name: string; patches: (doc: BoardDocument) => Patch[] }[] = [
    {
      name: 'adding an object',
      patches: () => [{ op: 'add', id: asObjectId('new'), object: makeObject('new') }],
    },
    {
      name: 'removing an object',
      patches: () => [{ op: 'remove', id: asObjectId('a') }],
    },
    {
      name: 'setting a nested value',
      patches: () => [{ op: 'set', id: asObjectId('a'), path: ['frame', 'x'], value: 999 }],
    },
    {
      name: 'setting a whole sub-object',
      patches: () => [
        {
          op: 'set',
          id: asObjectId('a'),
          path: ['frame'],
          value: { x: 7, y: 7, width: 7, height: 7, rotation: 0 },
        },
      ],
    },
    {
      name: 'setting a property that did not exist',
      patches: () => [{ op: 'set', id: asObjectId('a'), path: ['style', 'color'], value: 'red' }],
    },
    {
      name: 'clearing a property by setting undefined',
      patches: () => [
        { op: 'set', id: asObjectId('b'), path: ['style', 'color'], value: undefined },
      ],
    },
    {
      name: 'a mixed batch touching several objects',
      patches: () => [
        { op: 'set', id: asObjectId('a'), path: ['frame', 'x'], value: 50 },
        { op: 'remove', id: asObjectId('b') },
        { op: 'add', id: asObjectId('c'), object: makeObject('c') },
        { op: 'set', id: asObjectId('a'), path: ['data', 'text'], value: 'changed' },
      ],
    },
    {
      name: 'repeated writes to the same path',
      patches: () => [
        { op: 'set', id: asObjectId('a'), path: ['frame', 'x'], value: 1 },
        { op: 'set', id: asObjectId('a'), path: ['frame', 'x'], value: 2 },
        { op: 'set', id: asObjectId('a'), path: ['frame', 'x'], value: 3 },
      ],
    },
    {
      name: 'removing and re-adding the same id',
      patches: () => [
        { op: 'remove', id: asObjectId('a') },
        { op: 'add', id: asObjectId('a'), object: makeObject('a', 500) },
      ],
    },
  ]

  const styled = { ...makeObject('b', 10), style: { color: 'blue' as const } }

  for (const testCase of cases) {
    it(`restores the exact prior document after ${testCase.name}`, () => {
      const before = docWith(makeObject('a'), styled)
      const patches = testCase.patches(before)

      const after = applyPatches(before, patches)
      const inverse = invertPatches(before, patches)
      const restored = applyPatches(after, inverse)

      expect(restored.objects).toEqual(before.objects)
    })
  }

  it('leaves the original document untouched', () => {
    const before = docWith(makeObject('a'))
    const snapshot = deepClone([...before.objects.entries()])
    applyPatches(before, [{ op: 'set', id: asObjectId('a'), path: ['frame', 'x'], value: 42 }])
    expect([...before.objects.entries()]).toEqual(snapshot)
  })

  it('preserves object identity for untouched objects', () => {
    const untouched = makeObject('b')
    const before = docWith(makeObject('a'), untouched)
    const after = applyPatches(before, [
      { op: 'set', id: asObjectId('a'), path: ['frame', 'x'], value: 42 },
    ])
    expect(after.objects.get(asObjectId('b'))).toBe(untouched)
  })

  it('refuses to patch an object that does not exist', () => {
    const before = docWith(makeObject('a'))
    expect(() =>
      applyPatches(before, [{ op: 'set', id: asObjectId('ghost'), path: ['frame'], value: {} }]),
    ).toThrow(PatchError)
  })

  it('returns the same document reference for an empty patch list', () => {
    const before = docWith(makeObject('a'))
    expect(applyPatches(before, [])).toBe(before)
  })
})
