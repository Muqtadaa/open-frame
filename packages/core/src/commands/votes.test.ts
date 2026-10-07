import { beforeEach, describe, expect, it } from 'vitest'

import { asObjectId, type ObjectId } from '../domain/ids.js'
import { richFromPlain } from '../domain/rich-text.js'
import { createTestHarness, type TestHarness } from '../testing.js'
import type { MarkAuthor } from '../types/reaction/schema.js'
import { VOTE_MARK, voteId } from '../types/vote/definition.js'
import { currentVoteRound } from '../types/vote-round/definition.js'
import type { VoteScope } from '../types/vote-round/schema.js'

/**
 * Dot voting: a round on the board, and every dot an object of its own,
 * counted through the mark index rather than kept as a tally anywhere.
 */
const otter: MarkAuthor = { key: 'g_otter', name: 'Otter', hue: 30 }
const heron: MarkAuthor = { key: 'g_heron', name: 'Heron', hue: 200 }

function create(h: TestHarness, type: string, extra: Record<string, unknown> = {}): ObjectId {
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [
      {
        type,
        x: 0,
        y: 0,
        ...(type === 'sticky' ? { data: { text: richFromPlain('A note') } } : {}),
        ...extra,
      },
    ],
  })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected a created object')
  return id
}

function start(
  h: TestHarness,
  options: { scope?: VoteScope; perPerson?: number; hidden?: boolean } = {},
): ObjectId {
  const result = h.dispatcher.dispatch({
    kind: 'StartVoteRound',
    title: 'Which first?',
    scope: options.scope ?? { kind: 'board' },
    perPerson: options.perPerson ?? 3,
    hidden: options.hidden ?? false,
    by: otter,
  })
  if (!result.ok) throw result.error
  const round = currentVoteRound(h.store.getDocument())
  if (round === null) throw new Error('expected a round')
  return round.id
}

const cast = (h: TestHarness, round: ObjectId, target: ObjectId, by: MarkAuthor = otter) =>
  h.dispatcher.dispatch({ kind: 'CastDotVote', round, target, by })

const count = (h: TestHarness, target: ObjectId) =>
  h.registry.marksOn(h.store.getDocument(), target).filter((link) => link.edge.kind === VOTE_MARK)
    .length

describe('dot voting', () => {
  let h: TestHarness
  let note: ObjectId
  let other: ObjectId
  beforeEach(() => {
    h = createTestHarness()
    note = create(h, 'sticky')
    other = create(h, 'sticky')
  })

  it('puts a dot on a note, and stacks a second', () => {
    const round = start(h)
    expect(cast(h, round, note).ok).toBe(true)
    expect(cast(h, round, note).ok).toBe(true)
    expect(count(h, note)).toBe(2)
  })

  it('refuses a dot past the allowance, and counts each person separately', () => {
    const round = start(h, { perPerson: 2 })
    expect(cast(h, round, note).ok).toBe(true)
    expect(cast(h, round, other).ok).toBe(true)
    const third = cast(h, round, note)
    expect(third.ok).toBe(false)
    if (!third.ok) expect(third.error.message).toBe('No votes left')
    expect(cast(h, round, note, heron).ok).toBe(true)
    expect(count(h, note)).toBe(2)
  })

  it('numbers dots by slot, so a second device casting at once writes the same object', () => {
    const round = start(h)
    const result = cast(h, round, note)
    expect(result.ok && result.affected).toEqual([asObjectId(voteId(round, otter.key, 0))])
    // Taking it back frees the slot for the next dot, wherever it goes.
    expect(
      h.dispatcher.dispatch({ kind: 'RemoveDotVote', round, target: note, by: otter }).ok,
    ).toBe(true)
    const again = cast(h, round, other)
    expect(again.ok && again.affected).toEqual([asObjectId(voteId(round, otter.key, 0))])
  })

  it('takes back only one of this person’s dots on that note', () => {
    const round = start(h)
    cast(h, round, note)
    cast(h, round, note)
    cast(h, round, note, heron)
    expect(
      h.dispatcher.dispatch({ kind: 'RemoveDotVote', round, target: note, by: otter }).ok,
    ).toBe(true)
    expect(count(h, note)).toBe(2)
    const none = h.dispatcher.dispatch({ kind: 'RemoveDotVote', round, target: other, by: otter })
    expect(none.ok).toBe(false)
  })

  it('keeps votes to the notes in scope', () => {
    const round = start(h, { scope: { kind: 'objects', ids: [note] } })
    expect(cast(h, round, note).ok).toBe(true)
    expect(cast(h, round, other).ok).toBe(false)
  })

  it('counts a note anywhere inside a frame in scope, and nothing outside it', () => {
    const frame = create(h, 'frame')
    const inside = create(h, 'sticky', { parentId: frame })
    const round = start(h, { scope: { kind: 'frame', frame } })
    expect(cast(h, round, inside).ok).toBe(true)
    expect(cast(h, round, note).ok).toBe(false)
  })

  it('refuses a vote on something that cannot carry one', () => {
    const shape = create(h, 'shape')
    const round = start(h)
    expect(cast(h, round, shape).ok).toBe(false)
  })

  it('lets a locked note be voted on', () => {
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [note], locked: true })
    const round = start(h)
    expect(cast(h, round, note).ok).toBe(true)
  })

  it('refuses a vote once the round has ended, and keeps the count', () => {
    const round = start(h)
    cast(h, round, note)
    expect(h.dispatcher.dispatch({ kind: 'SetVoteRound', round, status: 'closed' }).ok).toBe(true)
    expect(cast(h, round, note).ok).toBe(false)
    expect(count(h, note)).toBe(1)
  })

  it('reveals hidden counts', () => {
    const round = start(h, { hidden: true })
    expect(h.dispatcher.dispatch({ kind: 'SetVoteRound', round, hidden: false }).ok).toBe(true)
    expect(currentVoteRound(h.store.getDocument())?.data.hidden).toBe(false)
  })

  it('refuses a second round while one is open, and replaces one that has ended', () => {
    const first = start(h)
    cast(h, first, note)
    expect(
      h.dispatcher.dispatch({
        kind: 'StartVoteRound',
        title: '',
        scope: { kind: 'board' },
        perPerson: 3,
        hidden: false,
        by: heron,
      }).ok,
    ).toBe(false)

    h.dispatcher.dispatch({ kind: 'SetVoteRound', round: first, status: 'closed' })
    const second = start(h)
    expect(second).not.toBe(first)
    expect(h.store.getDocument().objects.has(first)).toBe(false)
    expect(count(h, note)).toBe(0)

    // One undo brings the ended round back with its votes.
    h.dispatcher.undo()
    expect(currentVoteRound(h.store.getDocument())?.id).toBe(first)
    expect(count(h, note)).toBe(1)
  })

  it('clears a round with its votes, and one undo restores both', () => {
    const round = start(h)
    cast(h, round, note)
    cast(h, round, other, heron)
    expect(h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [round] }).ok).toBe(true)
    expect(count(h, note) + count(h, other)).toBe(0)
    h.dispatcher.undo()
    expect(count(h, note) + count(h, other)).toBe(2)
  })

  it('takes a note’s votes with it when it is deleted', () => {
    const round = start(h)
    cast(h, round, note)
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [note] })
    expect(h.registry.marksWithin(h.store.getDocument(), round)).toEqual([])
  })

  it('refuses a round it could not hold', () => {
    const tooMany = h.dispatcher.dispatch({
      kind: 'StartVoteRound',
      title: '',
      scope: { kind: 'board' },
      perPerson: 21,
      hidden: false,
      by: otter,
    })
    expect(tooMany.ok).toBe(false)
    const badAuthor = h.dispatcher.dispatch({
      kind: 'CastDotVote',
      round: start(h),
      target: note,
      by: { key: 'not a key', name: 'X', hue: 0 },
    })
    expect(badAuthor.ok).toBe(false)
  })

  it('names a round by its place in the board’s run, so two people starting at once start one', () => {
    // Two devices, each starting from the same board before hearing of the other.
    const other = createTestHarness()
    expect(start(h)).toBe(start(other))

    // The next round is a new one, not the last one under the same name.
    const first = currentVoteRound(h.store.getDocument())?.id
    h.dispatcher.dispatch({ kind: 'SetVoteRound', round: first!, status: 'closed' })
    expect(start(h)).not.toBe(first)
  })

  it('is one undo step per dot', () => {
    const round = start(h)
    cast(h, round, note)
    cast(h, round, note)
    h.dispatcher.undo()
    expect(count(h, note)).toBe(1)
  })
})

/*
 * Undo takes back only what the person did: the round they started, not the
 * dots other people put in it. Those were left on the board pointing at a
 * round that no longer existed — and the next round on the board had the same
 * id, so it picked them up again: somebody's allowance was spent before they
 * had voted at all.
 */
describe('a round whose start was undone', () => {
  let h: TestHarness
  beforeEach(() => {
    h = createTestHarness()
  })

  it('leaves nothing behind for the next round to pick up', () => {
    const note = create(h, 'sticky')
    const round = start(h, { perPerson: 2 })
    // Heron's dots arrive from another device: not on this undo stack.
    for (let i = 0; i < 2; i++) {
      const result = h.dispatcher.dispatch(
        { kind: 'CastDotVote', round, target: note, by: heron },
        { skipUndo: true },
      )
      expect(result.ok).toBe(true)
    }
    h.dispatcher.undo()
    expect(currentVoteRound(h.store.getDocument())).toBeNull()

    const next = start(h, { perPerson: 2 })
    expect(count(h, note)).toBe(0)
    expect(cast(h, next, note, heron).ok).toBe(true)
    expect(cast(h, next, note, heron).ok).toBe(true)
    expect(count(h, note)).toBe(2)
  })
})
