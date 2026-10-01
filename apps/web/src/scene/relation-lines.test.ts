import { asObjectId, type Rect } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { clipToEdge, relationLines } from './relation-lines.js'

/**
 * A selected object's relations, as lines between the things they join.
 *
 * Relations have no appearance on the board (ADR 0011) and were readable only
 * in the record panel, so "this insight stands on that evidence" was a list of
 * names with nothing pointing at where the evidence sits.
 */
const A = asObjectId('obj_a')
const B = asObjectId('obj_b')
const C = asObjectId('obj_c')

const boxes: Record<string, Rect> = {
  [A]: { x: 0, y: 0, width: 100, height: 100 },
  [B]: { x: 300, y: 0, width: 100, height: 100 },
  [C]: { x: 0, y: 300, width: 100, height: 100 },
}
const boundsOf = (id: string): Rect | null => boxes[id] ?? null

describe('where a relation is drawn', () => {
  it('runs between the two edges facing each other, not centre to centre', () => {
    const [line] = relationLines(
      A,
      [{ id: asObjectId('rel_1'), edge: { from: A, to: B, predicate: 'cites' } }],
      [],
      boundsOf,
    )
    expect(line?.from).toEqual({ x: 100, y: 50 })
    expect(line?.to).toEqual({ x: 300, y: 50 })
    expect(line?.predicate).toBe('cites')
  })

  it('draws both what it stands on and what stands on it, each pointing the way it runs', () => {
    const lines = relationLines(
      A,
      [{ id: asObjectId('rel_1'), edge: { from: A, to: B, predicate: 'cites' } }],
      [{ id: asObjectId('rel_2'), edge: { from: C, to: A, predicate: 'derives' } }],
      boundsOf,
    )
    expect(lines.map((line) => line.id)).toEqual(['rel_1', 'rel_2'])
    // From C, below, up to A: the arrow ends on A's bottom edge.
    expect(lines[1]?.from).toEqual({ x: 50, y: 300 })
    expect(lines[1]?.to).toEqual({ x: 50, y: 100 })
  })

  it('draws only the selection’s own relations', () => {
    const lines = relationLines(
      A,
      [{ id: asObjectId('rel_1'), edge: { from: B, to: C, predicate: 'cites' } }],
      [],
      boundsOf,
    )
    expect(lines).toEqual([])
  })

  it('draws nothing to an object that is not on the board', () => {
    const lines = relationLines(
      A,
      [
        {
          id: asObjectId('rel_1'),
          edge: { from: A, to: asObjectId('obj_gone'), predicate: 'cites' },
        },
      ],
      [],
      boundsOf,
    )
    expect(lines).toEqual([])
  })

  it('draws nothing between boxes that overlap, where there is no gap to cross', () => {
    const overlapping = (id: string): Rect | null =>
      id === B ? { x: 50, y: 50, width: 100, height: 100 } : boundsOf(id)
    const lines = relationLines(
      A,
      [{ id: asObjectId('rel_1'), edge: { from: A, to: B, predicate: 'cites' } }],
      [],
      overlapping,
    )
    expect(lines).toEqual([])
  })
})

describe('leaving a box towards a point', () => {
  it('meets the edge the line crosses, at any angle', () => {
    const box = { x: 0, y: 0, width: 100, height: 50 }
    expect(clipToEdge(box, { x: 200, y: 25 })).toEqual({ x: 100, y: 25 })
    expect(clipToEdge(box, { x: 50, y: -100 })).toEqual({ x: 50, y: 0 })
    // Forty-five degrees from the middle of a wide box meets the bottom first.
    const corner = clipToEdge(box, { x: 150, y: 125 })
    expect(corner.x).toBeCloseTo(75, 6)
    expect(corner.y).toBeCloseTo(50, 6)
  })
})
