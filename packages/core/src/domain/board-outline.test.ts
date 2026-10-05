import { beforeEach, describe, expect, it } from 'vitest'

import type { NewObjectSpec } from '../commands/types.js'
import { createTestHarness, type TestHarness } from '../testing.js'
import { outlineBoard, type OutlineEntry } from './board-outline.js'
import type { ObjectId } from './ids.js'
import { richFromPlain } from './rich-text.js'

/**
 * A board told to somebody who cannot see it: what is on it, how it is
 * organised, and what it claims without grounds.
 */
let h: TestHarness

beforeEach(() => {
  h = createTestHarness()
})

function create(spec: NewObjectSpec): ObjectId {
  const result = h.dispatcher.dispatch({ kind: 'CreateObjects', objects: [spec] })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected an object')
  return id
}

const of = (type: string, parentId: ObjectId | null = null, extra: Partial<NewObjectSpec> = {}) =>
  create({ type, x: 0, y: 0, parentId, data: { text: richFromPlain(type) }, ...extra })

const relate = (from: ObjectId, to: ObjectId) =>
  create({ type: 'relation', x: 0, y: 0, data: { from, to, predicate: 'cites' } })

const outline = () => outlineBoard(h.store.getDocument(), h.registry)
const idsOf = (entries: readonly OutlineEntry[]) => entries.map((entry) => entry.object.id)

describe('what is on the board', () => {
  it('counts what is on it, most numerous first, and nothing hidden or placeless', () => {
    const a = of('sticky')
    const b = of('sticky')
    of('evidence')
    of('sticky', null, { hidden: true })
    relate(a, b)

    const { counts, total } = outline()
    expect(counts).toEqual([
      { type: 'sticky', count: 2 },
      { type: 'evidence', count: 1 },
    ])
    expect(total).toBe(3)
  })

  it('lists a frame with what it holds, and nested frames inside it', () => {
    const outer = create({ type: 'frame', x: 0, y: 0, data: { name: 'Findings' } })
    const inner = create({ type: 'frame', x: 0, y: 0, parentId: outer, data: {} })
    const note = of('sticky', inner)
    const loose = of('sticky')

    const { top } = outline()
    expect(idsOf(top)).toEqual([outer, loose])
    const [frame] = top
    expect(idsOf(frame?.members ?? [])).toEqual([inner])
    expect(idsOf(frame?.members[0]?.members ?? [])).toEqual([note])
    expect(frame?.held).toBe(2)
  })

  it('lists a group as one thing, as Tab reaches it, while counting what is in it', () => {
    const group = create({ type: 'group', x: 0, y: 0, data: {} })
    of('sticky', group)
    of('sticky', group)

    const { top, total } = outline()
    expect(idsOf(top)).toEqual([group])
    expect(top[0]?.members).toEqual([])
    expect(top[0]?.held).toBe(2)
    expect(total).toBe(3)
  })

  // An empty frame still says it holds nothing, not like a note (Codex, on #78).
  it('says an empty frame is one that holds things', () => {
    create({ type: 'frame', x: 0, y: 0, data: {} })
    of('sticky')
    expect(outline().top.map((entry) => [entry.object.type, entry.holds, entry.held])).toEqual([
      ['frame', true, 0],
      ['sticky', false, 0],
    ])
  })

  /*
   * Hiding a frame hides the frame, not what is in it: its members are still
   * drawn and still Tab stops, so they stand in its place (Codex, on #78).
   */
  it('lists what a hidden frame holds in its place', () => {
    const frame = create({ type: 'frame', x: 0, y: 0, data: {}, hidden: true })
    const inside = of('sticky', frame)
    const { top, total } = outline()
    expect(idsOf(top)).toEqual([inside])
    expect(total).toBe(1)
  })

  it('is empty for an empty board', () => {
    expect(outline()).toEqual({ counts: [], total: 0, top: [], unsupported: [] })
  })
})

describe('what the board claims without grounds', () => {
  it('names a claim that cites nothing, and not one that cites evidence', () => {
    const evidence = of('evidence')
    const grounded = of('insight')
    const bare = of('insight')
    relate(grounded, evidence)

    expect(outline().unsupported).toEqual([{ type: 'insight', ids: [bare] }])
  })

  it('names every bare claim of a type, in one list', () => {
    const bare = [of('insight'), of('insight'), of('insight')]
    expect(outline().unsupported).toEqual([{ type: 'insight', ids: bare }])
  })

  it('never names what nothing is derived into — a note is not a claim', () => {
    of('sticky')
    of('evidence')
    expect(outline().unsupported).toEqual([])
  })

  it('finds a bare claim inside a group, which the list shows as one thing', () => {
    const group = create({ type: 'group', x: 0, y: 0, data: {} })
    const bare = of('insight', group)
    expect(outline().unsupported).toEqual([{ type: 'insight', ids: [bare] }])
  })
})
