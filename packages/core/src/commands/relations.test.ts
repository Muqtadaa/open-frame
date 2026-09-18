import { beforeEach, describe, expect, it } from 'vitest'

import type { ObjectId } from '../domain/ids.js'
import { createTestHarness, type TestHarness } from '../testing.js'

function sticky(h: TestHarness, text: string): ObjectId {
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ type: 'sticky', x: 0, y: 0, data: { text } }],
  })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected a created object')
  return id
}

function relate(h: TestHarness, from: ObjectId, to: ObjectId, predicate = 'cites'): ObjectId {
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ type: 'relation', x: 0, y: 0, data: { from, to, predicate } }],
  })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected a created relation')
  return id
}

describe('relations (ADR 0011)', () => {
  let h: TestHarness
  beforeEach(() => {
    h = createTestHarness()
  })

  describe('the deferred question', () => {
    it('answers "which objects cite this one?"', () => {
      const evidence = sticky(h, 'P07 could not find the price')
      const insightA = sticky(h, 'Pricing is not discoverable')
      const insightB = sticky(h, 'Users abandon at the pricing step')
      relate(h, insightA, evidence)
      relate(h, insightB, evidence)

      const citing = h.registry.relationsTo(h.store.getDocument(), evidence)
      expect(citing.map((link) => link.edge.from).sort()).toEqual([insightA, insightB].sort())
    })

    it('answers the forward direction from the same index', () => {
      const evidence = sticky(h, 'e')
      const insight = sticky(h, 'i')
      relate(h, insight, evidence)
      expect(h.registry.relationsFrom(h.store.getDocument(), insight).map((l) => l.edge.to)).toEqual([
        evidence,
      ])
    })

    /*
     * The index is memoized on document identity. A stale index would answer
     * the previous version's question, which is worse than a slow one — so the
     * test dispatches between two reads rather than trusting the cache key.
     */
    it('reflects a relation added after the index was built', () => {
      const a = sticky(h, 'a')
      const b = sticky(h, 'b')
      expect(h.registry.relationsTo(h.store.getDocument(), b)).toEqual([])
      relate(h, a, b)
      expect(h.registry.relationsTo(h.store.getDocument(), b)).toHaveLength(1)
    })
  })

  describe('deleting an end', () => {
    it('deletes the relations that pointed at it', () => {
      const evidence = sticky(h, 'e')
      const insight = sticky(h, 'i')
      const rel = relate(h, insight, evidence)

      const result = h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [evidence] })
      expect(result.ok).toBe(true)
      expect(h.store.getObject(rel)).toBeUndefined()
    })

    it('deletes relations pointing away from it as well', () => {
      const evidence = sticky(h, 'e')
      const insight = sticky(h, 'i')
      const rel = relate(h, insight, evidence)

      h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [insight] })
      expect(h.store.getObject(rel)).toBeUndefined()
    })

    /**
     * The reason the cascade lives inside the handler rather than in a second
     * command: one command is one undo entry. Two would restore the object
     * stripped of its provenance and report success.
     */
    it('restores the object AND its citations on undo', () => {
      const evidence = sticky(h, 'e')
      const insightA = sticky(h, 'a')
      const insightB = sticky(h, 'b')
      const relA = relate(h, insightA, evidence)
      const relB = relate(h, insightB, evidence)

      h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [evidence] })
      expect(h.store.getObject(relA)).toBeUndefined()
      expect(h.store.getObject(relB)).toBeUndefined()

      h.dispatcher.undo()
      expect(h.store.getObject(evidence)).toBeDefined()
      expect(h.store.getObject(relA)).toBeDefined()
      expect(h.store.getObject(relB)).toBeDefined()
      expect(h.registry.relationsTo(h.store.getDocument(), evidence)).toHaveLength(2)
    })

    /**
     * A relation is not a connector. A connector with one orphaned end survives
     * as a line to a free point; a citation of nothing is not a citation.
     */
    it('leaves the surviving end alone', () => {
      const evidence = sticky(h, 'e')
      const insight = sticky(h, 'i')
      relate(h, insight, evidence)
      h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [evidence] })
      expect(h.store.getObject(insight)).toBeDefined()
    })

    it('cascades through a deleted container to its children', () => {
      const frame = h.dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [{ type: 'frame', x: 0, y: 0 }],
      })
      if (!frame.ok) throw frame.error
      const frameId = frame.affected[0]!
      const evidence = sticky(h, 'e')
      const insight = sticky(h, 'i')
      const rel = relate(h, insight, evidence)
      h.dispatcher.dispatch({ kind: 'ReparentObjects', ids: [evidence], parentId: frameId })

      // Deleting the frame deletes the evidence inside it, which must in turn
      // take the citation with it — the doomed set grows, and the relation
      // sweep has to see the grown set rather than the ids the command named.
      h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [frameId] })
      expect(h.store.getObject(evidence)).toBeUndefined()
      expect(h.store.getObject(rel)).toBeUndefined()
    })
  })

  describe('duplicates', () => {
    /*
     * ADR 0011 accepts duplicate relations as benign — two people adding the
     * same citation concurrently is the case, and losing one is the failure
     * that embedding ids in an array would have produced.
     */
    it('permits an identical relation twice', () => {
      const a = sticky(h, 'a')
      const b = sticky(h, 'b')
      relate(h, a, b)
      relate(h, a, b)
      expect(h.registry.relationsTo(h.store.getDocument(), b)).toHaveLength(2)
    })
  })
})
