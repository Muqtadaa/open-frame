import { beforeEach, describe, expect, it } from 'vitest'

import type { ObjectId } from '../domain/ids.js'
import { richFromPlain } from '../domain/rich-text.js'
import { createTestHarness, type TestHarness } from '../testing.js'
import { reactionId } from '../types/reaction/definition.js'
import type { MarkAuthor } from '../types/reaction/schema.js'

/**
 * Reactions: one person's response to a note, as an object of its own.
 *
 * Objects rather than a list inside the note for the reason relations are
 * (ADR 0011) — the board merges object by object, so a list two people
 * append to at once loses one of them.
 */
const otter: MarkAuthor = { key: 'g_otter', name: 'Otter', hue: 30 }
const heron: MarkAuthor = { key: 'g_heron', name: 'Heron', hue: 200 }

function create(h: TestHarness, type: string, text?: string): ObjectId {
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [
      {
        type,
        x: 0,
        y: 0,
        ...(text === undefined ? {} : { data: { text: richFromPlain(text) } }),
      },
    ],
  })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected a created object')
  return id
}

function react(h: TestHarness, target: ObjectId, glyph: string, by: MarkAuthor) {
  return h.dispatcher.dispatch({ kind: 'ToggleReaction', target, glyph, by })
}

const on = (h: TestHarness, id: ObjectId) =>
  h.registry
    .marksOn(h.store.getDocument(), id)
    .map((link) => `${link.edge.value}:${link.edge.by}`)
    .sort()

describe('reactions', () => {
  let h: TestHarness
  let note: ObjectId
  beforeEach(() => {
    h = createTestHarness()
    note = create(h, 'sticky', 'Price is hidden')
  })

  it('adds a reaction, and takes it away when the same person toggles it again', () => {
    expect(react(h, note, 'plus-one', otter).ok).toBe(true)
    expect(on(h, note)).toEqual(['plus-one:g_otter'])

    expect(react(h, note, 'plus-one', otter).ok).toBe(true)
    expect(on(h, note)).toEqual([])
  })

  it('keeps one reaction per person, per kind', () => {
    react(h, note, 'plus-one', otter)
    react(h, note, 'plus-one', heron)
    react(h, note, 'heart', otter)
    expect(on(h, note)).toEqual(['heart:g_otter', 'plus-one:g_heron', 'plus-one:g_otter'])
  })

  /*
   * The id is a function of the note, the kind and the person, so the same
   * person reacting from two devices writes ONE object — two adds of the same
   * id merge — rather than being counted twice.
   */
  it('names a reaction by what it is on, what it is and who left it', () => {
    react(h, note, 'idea', otter)
    const id = reactionId(note, 'idea', 'g_otter')
    expect(h.store.getDocument().objects.get(id as ObjectId)?.type).toBe('reaction')
  })

  it('is one undo step each way', () => {
    react(h, note, 'party', otter)
    h.dispatcher.undo()
    expect(on(h, note)).toEqual([])
    h.dispatcher.redo()
    expect(on(h, note)).toEqual(['party:g_otter'])
  })

  it('refuses a type nobody reacts to', () => {
    const frame = create(h, 'frame')
    const result = react(h, frame, 'heart', otter)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid-input')
    expect(on(h, frame)).toEqual([])
  })

  it('refuses a glyph or an author that is not well formed', () => {
    for (const [glyph, by] of [
      ['<script>', otter],
      ['plus-one', { ...otter, key: 'has space' }],
      ['plus-one', { ...otter, name: '' }],
    ] as const) {
      const result = react(h, note, glyph, by)
      expect(result.ok, `${glyph} by ${by.key}`).toBe(false)
    }
    expect(on(h, note)).toEqual([])
  })

  /*
   * Locking a note stops people CHANGING it. A reaction does not change it —
   * it is a separate object — so a locked note can still be agreed with.
   */
  it('can be left on a locked note', () => {
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [note], locked: true })
    expect(react(h, note, 'check', otter).ok).toBe(true)
    expect(on(h, note)).toEqual(['check:g_otter'])
  })

  /*
   * A reaction to nothing is not a reaction, so it dies with its note — and
   * in the SAME command, so undoing the delete brings the note back with its
   * reactions rather than stripped of them.
   */
  it('dies with its note, and comes back with it on undo', () => {
    react(h, note, 'plus-one', otter)
    react(h, note, 'heart', heron)
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [note] })

    const doc = h.store.getDocument()
    expect([...doc.objects.values()].filter((o) => o.type === 'reaction')).toEqual([])

    h.dispatcher.undo()
    expect(on(h, note)).toEqual(['heart:g_heron', 'plus-one:g_otter'])
  })

  it('is not carried by a duplicate', () => {
    react(h, note, 'plus-one', otter)
    const result = h.dispatcher.dispatch({ kind: 'DuplicateObjects', ids: [note], dx: 24, dy: 24 })
    if (!result.ok) throw result.error
    const copy = result.affected.find((id) => id !== note)
    if (copy === undefined) throw new Error('expected a copy')
    expect(on(h, copy)).toEqual([])
    expect(on(h, note)).toEqual(['plus-one:g_otter'])
  })

  /*
   * The index is memoized on document identity, like the relation index. A
   * stale one would show yesterday's reactions, so the test changes the board
   * between two reads rather than trusting the cache key.
   */
  it('answers from an index that follows the board', () => {
    react(h, note, 'plus-one', otter)
    expect(on(h, note)).toEqual(['plus-one:g_otter'])
    react(h, note, 'plus-one', heron)
    expect(on(h, note)).toEqual(['plus-one:g_heron', 'plus-one:g_otter'])
  })

  /*
   * Generic commands can make a reaction too — an agent's create_objects, an
   * edit to its data — and then the id no longer says what it is. Taking one
   * back must find it by what it IS, or pressing the chip adds a second.
   */
  it('takes back a reaction made under another id', () => {
    const note = create(h, 'sticky', 'Ship it')
    const made = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [
        { type: 'reaction', x: 0, y: 0, data: { target: note, glyph: 'plus-one', by: otter } },
      ],
    })
    expect(made.ok).toBe(true)
    expect(on(h, note)).toEqual(['plus-one:g_otter'])

    expect(react(h, note, 'plus-one', otter).ok).toBe(true)
    expect(on(h, note)).toEqual([])
    expect(react(h, note, 'plus-one', otter).ok).toBe(true)
    expect(on(h, note)).toEqual(['plus-one:g_otter'])
  })

  it('takes back a reaction whose glyph was changed under it', () => {
    const note = create(h, 'sticky', 'Ship it')
    react(h, note, 'plus-one', otter)
    const id = reactionId(note, 'plus-one', otter.key) as ObjectId
    const edited = h.dispatcher.dispatch({
      kind: 'UpdateObjectData',
      id,
      patch: { glyph: 'heart' },
    })
    expect(edited.ok).toBe(true)
    expect(on(h, note)).toEqual(['heart:g_otter'])

    react(h, note, 'heart', otter)
    expect(on(h, note)).toEqual([])
  })

  it('refuses a name that would break onto a second line', () => {
    const note = create(h, 'sticky', 'Ship it')
    expect(react(h, note, 'plus-one', { ...otter, name: 'Ot\nter' }).ok).toBe(false)
    expect(react(h, note, 'plus-one', { ...otter, name: 'Ot\tter' }).ok).toBe(false)
  })

  // Any emoji, not only the eight on the bar: stored as its code points.
  it('holds any emoji, by its code points', () => {
    const note = create(h, 'sticky', 'Ship it')
    expect(react(h, note, 'u-1f468-200d-1f469-200d-1f467-200d-1f466', otter).ok).toBe(true)
    expect(on(h, note)).toEqual(['u-1f468-200d-1f469-200d-1f467-200d-1f466:g_otter'])
    // Not a key and not code points: refused at the boundary.
    expect(react(h, note, 'u-' + '1f600-'.repeat(20) + '1f600', otter).ok).toBe(false)
    expect(react(h, note, '😀', otter).ok).toBe(false)
  })
})
