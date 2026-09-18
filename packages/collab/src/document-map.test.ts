import {
  applyPatches,
  asObjectId,
  richFromPlain,
  type AnyOpenFrameObject,
  type BoardDocument,
  type ObjectId,
  type Patch,
} from '@openframe/core'
/*
 * The harness is a deliberate subpath, not part of the main entry: it wires a
 * dispatcher with a frozen clock and sequential ids, which is exactly what this
 * test wants and exactly what an application must never import.
 */
import { createTestHarness } from '@openframe/core/testing'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { applyPatchesToDoc, objectsFromDoc, seedDoc } from './document-map.js'

/** A board built through the real command layer, so the patches are real ones. */
function board(): { doc: BoardDocument; patches: Patch[] } {
  const h = createTestHarness()
  const patches: Patch[] = []
  const record = (result: { ok: boolean; patches?: readonly Patch[] }): void => {
    if (result.ok && result.patches !== undefined) patches.push(...result.patches)
  }

  const created = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [
      { type: 'sticky', x: 0, y: 0, data: { text: richFromPlain('one') } },
      { type: 'sticky', x: 200, y: 0, data: { text: richFromPlain('two') } },
      {
        type: 'evidence',
        x: 400,
        y: 0,
        data: {
          text: richFromPlain('Could not find the price'),
          source: 'September study',
          participant: 'P07',
          tags: ['pricing', 'comprehension'],
        },
      },
    ],
  })
  record(created)
  if (!created.ok) throw created.error

  const [a, b] = created.affected
  if (a === undefined || b === undefined) throw new Error('expected objects')

  record(h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: a, dx: 30, dy: 40 }] }))
  record(h.dispatcher.dispatch({ kind: 'UpdateStyle', ids: [a, b], style: { color: 'blue' } }))
  record(h.dispatcher.dispatch({ kind: 'SetLocked', ids: [b], locked: true }))
  record(h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [a], toType: 'insight' }))

  return { doc: h.store.getDocument(), patches }
}

describe('a board inside a Y.Doc', () => {
  /**
   * The property the whole adapter exists to have.
   *
   * Replaying the real patch stream into a `Y.Doc` must produce exactly the
   * document the command layer produced by applying the same patches. Anything
   * else means the CRDT and the domain disagree about what happened — which is
   * the failure nobody would notice until two people were already editing.
   */
  it('reproduces the document the patches produced', () => {
    const { doc: expected, patches } = board()
    const ydoc = new Y.Doc()
    applyPatchesToDoc(ydoc, patches)
    expect(objectsFromDoc(ydoc)).toEqual(expected.objects)
  })

  it('round-trips a document through a seed and back', () => {
    const { doc } = board()
    const ydoc = new Y.Doc()
    seedDoc(ydoc, doc)
    expect(objectsFromDoc(ydoc)).toEqual(doc.objects)
  })

  /**
   * A `set` with `value: undefined` DELETES the key — the rule that makes
   * `invertPatches` exact for a property that did not previously exist. If the
   * adapter stored `undefined` instead, undoing a colour change would leave
   * `{ color: undefined }` where the original had no key at all, and the two
   * documents would stop comparing equal.
   */
  it('deletes a key rather than storing undefined', () => {
    const h = createTestHarness()
    const created = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 0, y: 0, data: { text: richFromPlain('x') } }],
    })
    if (!created.ok) throw created.error
    const id = created.affected[0]
    if (id === undefined) return

    const ydoc = new Y.Doc()
    applyPatchesToDoc(ydoc, created.patches)
    applyPatchesToDoc(ydoc, [{ op: 'set', id, path: ['style', 'color'], value: 'blue' }])
    applyPatchesToDoc(ydoc, [{ op: 'set', id, path: ['style', 'color'], value: undefined }])

    const style = objectsFromDoc(ydoc).get(id)?.style ?? {}
    expect(Object.hasOwn(style, 'color')).toBe(false)
  })

  /**
   * Arrays stay arrays. Spreading one into an object would turn `tags: ['a']`
   * into `tags: { 0: 'a' }` on the first write — valid JSON, accepted by
   * nothing, and invisible until somebody's tags stopped rendering.
   */
  it('keeps an array an array when writing through it', () => {
    const h = createTestHarness()
    const created = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [
        {
          type: 'evidence',
          x: 0,
          y: 0,
          data: { text: richFromPlain('e'), source: '', participant: '', tags: ['a', 'b'] },
        },
      ],
    })
    if (!created.ok) throw created.error
    const id = created.affected[0]
    if (id === undefined) return

    const ydoc = new Y.Doc()
    applyPatchesToDoc(ydoc, created.patches)
    applyPatchesToDoc(ydoc, [{ op: 'set', id, path: ['data', 'tags', 1], value: 'c' }])

    const tags = (objectsFromDoc(ydoc).get(id)?.data as { tags: unknown }).tags
    expect(Array.isArray(tags)).toBe(true)
    expect(tags).toEqual(['a', 'c'])
  })

  it('never shares a reference with the Y.Doc', () => {
    const { doc } = board()
    const ydoc = new Y.Doc()
    seedDoc(ydoc, doc)
    const first = objectsFromDoc(ydoc)
    const second = objectsFromDoc(ydoc)
    const id = [...first.keys()][0]
    if (id === undefined) return
    expect(first.get(id)).not.toBe(second.get(id))
    expect(first.get(id)).toEqual(second.get(id))
  })
})

describe('two people editing at once', () => {
  /** Two documents joined by their update streams, as a room would join them. */
  function pair(): { a: Y.Doc; b: Y.Doc; sync: () => void } {
    const a = new Y.Doc()
    const b = new Y.Doc()
    const sync = (): void => {
      // Both directions, twice, so each has seen everything the other has.
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)))
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)))
    }
    return { a, b, sync }
  }

  /**
   * The case ADR 0011 chose the relation model for.
   *
   * Two people citing the same insight concurrently. As objects these are two
   * `add`s on different ids, which commute — the whole point. Had citations
   * been an array on the insight, both would be whole-array `set`s and one
   * would lose.
   */
  it('keeps both of two concurrent citations', () => {
    const { a, b, sync } = pair()
    const insight = asObjectId('obj_insight')
    const seed: Patch[] = [
      { op: 'add', id: insight, object: stub(insight, 'insight') },
      { op: 'add', id: asObjectId('obj_e1'), object: stub(asObjectId('obj_e1'), 'evidence') },
      { op: 'add', id: asObjectId('obj_e2'), object: stub(asObjectId('obj_e2'), 'evidence') },
    ]
    applyPatchesToDoc(a, seed)
    sync()

    applyPatchesToDoc(a, [
      { op: 'add', id: asObjectId('obj_r1'), object: relation('obj_r1', insight, 'obj_e1') },
    ])
    applyPatchesToDoc(b, [
      { op: 'add', id: asObjectId('obj_r2'), object: relation('obj_r2', insight, 'obj_e2') },
    ])
    sync()

    for (const doc of [a, b]) {
      const objects = objectsFromDoc(doc)
      expect(objects.has(asObjectId('obj_r1'))).toBe(true)
      expect(objects.has(asObjectId('obj_r2'))).toBe(true)
    }
  })

  /**
   * An `add` racing a `remove` of the same id. Last writer wins at the map
   * level, and both sides agree on WHICH — that agreement is the only thing
   * that matters, because a board where two people see different objects is
   * worse than either outcome.
   */
  it('leaves both sides agreeing after an add races a remove', () => {
    const { a, b, sync } = pair()
    const id = asObjectId('obj_x')
    applyPatchesToDoc(a, [{ op: 'add', id, object: stub(id, 'sticky') }])
    sync()

    applyPatchesToDoc(a, [{ op: 'remove', id }])
    applyPatchesToDoc(b, [{ op: 'set', id, path: ['locked'], value: true }])
    sync()

    expect(objectsFromDoc(a).has(id)).toBe(objectsFromDoc(b).has(id))
    expect(objectsFromDoc(a)).toEqual(objectsFromDoc(b))
  })

  /**
   * Two people moving DIFFERENT objects is the common case, and it must not be
   * a conflict at all — which is what the flat object map bought (ADR 0007).
   */
  it('merges edits to different objects without either losing', () => {
    const { a, b, sync } = pair()
    const one = asObjectId('obj_1')
    const two = asObjectId('obj_2')
    applyPatchesToDoc(a, [
      { op: 'add', id: one, object: stub(one, 'sticky') },
      { op: 'add', id: two, object: stub(two, 'sticky') },
    ])
    sync()

    applyPatchesToDoc(a, [{ op: 'set', id: one, path: ['frame', 'x'], value: 99 }])
    applyPatchesToDoc(b, [{ op: 'set', id: two, path: ['frame', 'y'], value: 77 }])
    sync()

    const objects = objectsFromDoc(a)
    expect(objects.get(one)?.frame.x).toBe(99)
    expect(objects.get(two)?.frame.y).toBe(77)
    expect(objects).toEqual(objectsFromDoc(b))
  })

  /**
   * A `set` against an object someone else has deleted is dropped rather than
   * throwing. Their delete wins and this write has nothing to apply to — a
   * merge outcome, not a fault. Throwing would take down the sync loop over a
   * race the model is designed to have.
   */
  it('survives a write to an object that is already gone', () => {
    const { a, b, sync } = pair()
    const id = asObjectId('obj_gone')
    applyPatchesToDoc(a, [{ op: 'add', id, object: stub(id, 'sticky') }])
    sync()
    applyPatchesToDoc(a, [{ op: 'remove', id }])
    sync()

    expect(() =>
      applyPatchesToDoc(b, [{ op: 'set', id, path: ['locked'], value: true }]),
    ).not.toThrow()
    sync()
    expect(objectsFromDoc(a)).toEqual(objectsFromDoc(b))
  })

  /**
   * The document a collaborator ends up with must be one the DOMAIN would also
   * have produced — not merely one both peers agree on. Applying the same
   * patches locally and comparing is what catches a translation that is
   * self-consistent but wrong.
   */
  it('agrees with what applying the same patches locally produces', () => {
    const { doc, patches } = board()
    const ydoc = new Y.Doc()
    applyPatchesToDoc(ydoc, patches)

    const empty: BoardDocument = { ...doc, objects: new Map() }
    expect(objectsFromDoc(ydoc)).toEqual(applyPatches(empty, patches).objects)
  })
})

/**
 * A minimal object, for the merge tests.
 *
 * Deliberately NOT built through the registry: these tests are about how the
 * CRDT merges map entries, and a real type would drag its schema, its defaults
 * and its migrations into a question that has nothing to do with any of them.
 */
function stub(id: ObjectId, type: string): AnyOpenFrameObject {
  return {
    id,
    type,
    dataVersion: 1,
    frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
    parentId: null,
    order: 'a0',
    style: {},
    locked: false,
    hidden: false,
    data: {},
    meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
  } as unknown as AnyOpenFrameObject
}

function relation(id: string, from: ObjectId, to: string): AnyOpenFrameObject {
  return {
    ...stub(asObjectId(id), 'relation'),
    data: { from, to: asObjectId(to), predicate: 'cites' },
  }
}
