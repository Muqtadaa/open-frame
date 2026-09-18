import { beforeEach, describe, expect, it } from 'vitest'

import { z } from 'zod'

import type { ObjectId } from '../domain/ids.js'
import { defineObjectType, ObjectTypeRegistry } from '../domain/registry.js'
import { createTestHarness, type TestHarness } from '../testing.js'
import { createDefaultRegistry } from '../types/index.js'

function create(h: TestHarness, type: string, data?: Record<string, unknown>): ObjectId {
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ type, x: 10, y: 20, ...(data === undefined ? {} : { data }) }],
  })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected a created object')
  return id
}

describe('promoting an object to another type', () => {
  let h: TestHarness
  beforeEach(() => {
    h = createTestHarness()
  })

  it('changes the type in place', () => {
    const id = create(h, 'sticky', { text: 'Customers do not understand pricing' })
    const result = h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [id], toType: 'evidence' })
    expect(result.ok).toBe(true)
    expect(h.store.getObject(id)?.type).toBe('evidence')
  })

  /**
   * The reason this is a type change rather than a delete and a create.
   *
   * A new id would orphan every relation pointing at the old one, and ADR 0011
   * deletes an orphaned relation — so promoting a note that three insights
   * cite would silently destroy all three citations, which is exactly the
   * provenance the product exists to keep.
   */
  it('keeps the citations pointing at it', () => {
    const note = create(h, 'sticky', { text: 'Skipped the pricing page' })
    const insight = create(h, 'sticky', { text: 'Pricing is not discoverable' })
    create(h, 'relation', { from: insight, to: note, predicate: 'cites' })

    h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [note], toType: 'evidence' })

    expect(h.registry.relationsTo(h.store.getDocument(), note)).toHaveLength(1)
  })

  it('keeps position, order, parent, style and creation metadata', () => {
    const id = create(h, 'sticky', { text: 'x' })
    h.dispatcher.dispatch({ kind: 'UpdateStyle', ids: [id], style: { color: 'blue' } })
    const before = h.store.getObject(id)

    h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [id], toType: 'evidence' })
    const after = h.store.getObject(id)

    expect(after?.frame).toEqual(before?.frame)
    expect(after?.order).toEqual(before?.order)
    expect(after?.parentId).toEqual(before?.parentId)
    expect(after?.style).toEqual(before?.style)
    expect(after?.meta).toEqual(before?.meta)
  })

  it('carries the text across and fills the rest from the target defaults', () => {
    const id = create(h, 'sticky', { text: 'Participants skipped the pricing page' })
    h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [id], toType: 'evidence' })
    expect(h.store.getObject(id)?.data).toEqual({
      text: 'Participants skipped the pricing page',
      source: '',
      participant: '',
      tags: [],
    })
  })

  it('produces data its new type accepts', () => {
    const id = create(h, 'sticky', { text: 'x' })
    h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [id], toType: 'evidence' })
    const object = h.store.getObject(id)
    expect(object).toBeDefined()
    if (object === undefined) return
    expect(h.registry.get('evidence')?.validate(object.data).ok).toBe(true)
  })

  it('stamps the new type\'s current data version', () => {
    const id = create(h, 'sticky', { text: 'x' })
    h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [id], toType: 'evidence' })
    expect(h.store.getObject(id)?.dataVersion).toBe(h.registry.get('evidence')?.currentVersion)
  })

  it('is one undo entry that restores the original type and payload', () => {
    const id = create(h, 'sticky', { text: 'a note' })
    h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [id], toType: 'evidence' })
    h.dispatcher.undo()
    const object = h.store.getObject(id)
    expect(object?.type).toBe('sticky')
    expect(object?.data).toEqual({ text: 'a note' })
  })

  it('promotes a whole selection as one action', () => {
    const a = create(h, 'sticky', { text: 'a' })
    const b = create(h, 'sticky', { text: 'b' })
    h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [a, b], toType: 'evidence' })
    expect(h.store.getObject(a)?.type).toBe('evidence')
    expect(h.store.getObject(b)?.type).toBe('evidence')

    h.dispatcher.undo()
    expect(h.store.getObject(a)?.type).toBe('sticky')
    expect(h.store.getObject(b)?.type).toBe('sticky')
  })

  describe('refusals', () => {
    it('refuses a locked object', () => {
      const id = create(h, 'sticky', { text: 'x' })
      h.dispatcher.dispatch({ kind: 'SetLocked', ids: [id], locked: true })
      const result = h.dispatcher.dispatch({
        kind: 'ConvertObjects',
        ids: [id],
        toType: 'evidence',
      })
      expect(result.ok).toBe(false)
      expect(h.store.getObject(id)?.type).toBe('sticky')
    })

    it('refuses an unregistered target type', () => {
      const id = create(h, 'sticky', { text: 'x' })
      const result = h.dispatcher.dispatch({
        kind: 'ConvertObjects',
        ids: [id],
        toType: 'nonsense',
      })
      expect(result.ok).toBe(false)
    })

    /**
     * A relation has no place on the board. Converting an object into one would
     * take it off the board without deleting it — unculled, unhittable,
     * unselectable, with no way back but an undo there is nothing left to click.
     */
    it('refuses a target that has no place on the board', () => {
      const id = create(h, 'sticky', { text: 'x' })
      const result = h.dispatcher.dispatch({
        kind: 'ConvertObjects',
        ids: [id],
        toType: 'relation',
      })
      expect(result.ok).toBe(false)
      expect(h.store.getObject(id)?.type).toBe('sticky')
    })

    it('refuses to convert a container that still holds children', () => {
      const frame = create(h, 'frame')
      const child = create(h, 'sticky', { text: 'inside' })
      h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [child], parentId: frame })

      const result = h.dispatcher.dispatch({
        kind: 'ConvertObjects',
        ids: [frame],
        toType: 'evidence',
      })
      expect(result.ok).toBe(false)
      expect(h.store.getObject(frame)?.type).toBe('frame')
      // And the child is still where it was, rather than stranded.
      expect(h.store.getObject(child)?.parentId).toBe(frame)
    })

    it('refuses an empty selection, and a no-op conversion', () => {
      expect(h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [], toType: 'evidence' }).ok).toBe(
        false,
      )
      const id = create(h, 'evidence')
      expect(
        h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [id], toType: 'evidence' }).ok,
      ).toBe(false)
    })

    it('drops keys the target does not declare', () => {
      const id = create(h, 'shape', { shape: 'rectangle', text: 'Checkout' })
      h.dispatcher.dispatch({ kind: 'ConvertObjects', ids: [id], toType: 'evidence' })
      const object = h.store.getObject(id)
      expect(object?.data).toEqual({
        // A shape's label is its text, and it means the same thing here.
        text: 'Checkout',
        source: '',
        participant: '',
        tags: [],
      })
      expect(Object.hasOwn(object?.data ?? {}, 'shape')).toBe(false)
    })
  })
})


/**
 * Name intersection is a GUESS, and this is the case where it is wrong.
 *
 * Two types may spell a key the same way and hold different shapes under it.
 * When that happens the whole carry-over is dropped and the target's defaults
 * are used, because losing a field on promotion is a visible disappointment
 * while writing a malformed object is a corrupted board.
 *
 * No two shipped types collide this way today, so the collision is built here
 * rather than asserted about a pair that does not exist. Without that, this
 * branch would be a rule that passes vacuously (rule 23) — and it did: a first
 * version of this test used `shape` against `evidence`, where the only shared
 * key is `text` and both hold a string, so it proved nothing.
 */
describe('when two types spell a key the same way and mean different things', () => {
  const countedType = defineObjectType<'counted', { text: number }>({
    type: 'counted',
    schema: z.object({ text: z.number() }).strict(),
    currentVersion: 1,
    migrations: {},
    create: () => ({ data: { text: 7 }, frame: { width: 100, height: 100 } }),
    capabilities: {
      resizable: true,
      rotatable: false,
      textEditable: false,
      spatial: true,
      canHaveChildren: false,
      selectsAsUnit: false,
      connectable: true,
      styleProps: [],
    },
    describe: (object) => ({
      searchText: String(object.data.text),
      summary: `Counted ${String(object.data.text)}`,
      fields: { text: object.data.text },
    }),
  })

  it('falls back to the target defaults rather than writing a bad object', () => {
    const registry = new ObjectTypeRegistry([...createDefaultRegistry().list(), countedType])
    const h = createTestHarness({ registry })
    const id = create(h, 'counted')

    const result = h.dispatcher.dispatch({
      kind: 'ConvertObjects',
      ids: [id],
      toType: 'evidence',
    })
    expect(result.ok).toBe(true)

    // The number did NOT land in evidence's string `text`.
    expect(h.store.getObject(id)?.data).toEqual({
      text: '',
      source: '',
      participant: '',
      tags: [],
    })
  })
})
