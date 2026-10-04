import { beforeEach, describe, expect, it } from 'vitest'

import { asObjectId, type ObjectId } from '../domain/ids.js'
import { createTestHarness, type TestHarness } from '../testing.js'
import { POLL_MARK, pollAnswerId } from '../types/poll-answer/definition.js'
import type { MarkAuthor } from '../types/reaction/schema.js'

/**
 * Polls: a question on the board, and every person's pick an object of its
 * own, counted through the mark index.
 */
const otter: MarkAuthor = { key: 'g_otter', name: 'Otter', hue: 30 }
const heron: MarkAuthor = { key: 'g_heron', name: 'Heron', hue: 200 }

function poll(h: TestHarness, data: Record<string, unknown> = {}): ObjectId {
  const result = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ type: 'poll', x: 0, y: 0, data }],
  })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected a poll')
  return id
}

const answer = (h: TestHarness, id: ObjectId, option: string, by: MarkAuthor = otter) =>
  h.dispatcher.dispatch({ kind: 'AnswerPoll', poll: id, option, by })

const picks = (h: TestHarness, id: ObjectId) =>
  h.registry
    .marksOn(h.store.getDocument(), id)
    .filter((link) => link.edge.kind === POLL_MARK)
    .map((link) => `${link.edge.value}:${link.edge.by}`)
    .sort()

describe('polls', () => {
  let h: TestHarness
  beforeEach(() => {
    h = createTestHarness()
  })

  it('takes a pick, and takes it back when the same option is pressed again', () => {
    const id = poll(h)
    expect(answer(h, id, 'o1').ok).toBe(true)
    expect(picks(h, id)).toEqual(['o1:g_otter'])
    expect(answer(h, id, 'o1').ok).toBe(true)
    expect(picks(h, id)).toEqual([])
  })

  it('moves a single-choice answer in one step, and one undo puts it back', () => {
    const id = poll(h)
    answer(h, id, 'o1')
    answer(h, id, 'o2')
    expect(picks(h, id)).toEqual(['o2:g_otter'])
    h.dispatcher.undo()
    expect(picks(h, id)).toEqual(['o1:g_otter'])
  })

  it('lets a multi-choice poll hold several picks each', () => {
    const id = poll(h, { multi: true })
    answer(h, id, 'o1')
    answer(h, id, 'o2')
    answer(h, id, 'o1', heron)
    expect(picks(h, id)).toEqual(['o1:g_heron', 'o1:g_otter', 'o2:g_otter'])
  })

  it('gives a pick one id, so two devices answering at once write one object', () => {
    const id = poll(h, { multi: true })
    const result = answer(h, id, 'o2')
    expect(result.ok && result.affected).toEqual([asObjectId(pollAnswerId(id, 'o2', otter.key))])
  })

  it('gives a single-choice answer one id per person, whatever it picks', () => {
    // Two devices for one person, each answering before hearing of the other:
    // one object, so the merge keeps one answer rather than two.
    const other = createTestHarness()
    const here = poll(h)
    const there = poll(other)
    expect(here).toBe(there)
    const a = answer(h, here, 'o1')
    const b = answer(other, there, 'o2')
    expect(a.ok && a.affected).toEqual(b.ok && b.affected)

    // Changing your mind changes that one answer.
    const moved = answer(h, here, 'o2')
    expect(moved.ok && moved.affected).toEqual(a.ok && a.affected)
    expect(picks(h, here)).toEqual(['o2:g_otter'])
  })

  it('refuses an answer once the poll is closed', () => {
    const id = poll(h, { closed: true })
    const result = answer(h, id, 'o1')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('This poll is closed')
  })

  it('refuses an option the poll does not have, and anything that is not a poll', () => {
    const id = poll(h)
    expect(answer(h, id, 'o9').ok).toBe(false)
    const note = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 0, y: 0 }],
    })
    const noteId = note.ok ? note.affected[0] : undefined
    expect(noteId).toBeDefined()
    expect(answer(h, noteId!, 'o1').ok).toBe(false)
  })

  it('can be answered while locked', () => {
    const id = poll(h)
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [id], locked: true })
    expect(answer(h, id, 'o1').ok).toBe(true)
  })

  it('takes its answers with it when deleted, and one undo brings both back', () => {
    const id = poll(h)
    answer(h, id, 'o1')
    answer(h, id, 'o2', heron)
    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [id] })
    expect([...h.store.getDocument().objects.keys()]).toEqual([])
    h.dispatcher.undo()
    expect(picks(h, id)).toEqual(['o1:g_otter', 'o2:g_heron'])
  })

  it('refuses a poll with too few options, or two options with one id', () => {
    const id = poll(h)
    expect(
      h.dispatcher.dispatch({
        kind: 'UpdateObjectData',
        id,
        patch: { options: [{ id: 'o1', label: 'Only' }] },
      }).ok,
    ).toBe(false)
    expect(
      h.dispatcher.dispatch({
        kind: 'UpdateObjectData',
        id,
        patch: {
          options: [
            { id: 'o1', label: 'A' },
            { id: 'o1', label: 'B' },
          ],
        },
      }).ok,
    ).toBe(false)
  })
})
