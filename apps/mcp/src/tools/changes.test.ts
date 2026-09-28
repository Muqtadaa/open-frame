import { BoardRoom } from '@openframe/collab'
import { asObjectId, richFromPlain } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import type { BoardPeer } from '../board.js'
import type { BoardAccess } from '../supabase/account.js'
import { peerOn, settles, stubAccount, TEST_BOARD } from '../testing.js'
import { toolContext } from './context.js'
import { listChanges } from './read.js'
import { FRAMING } from './respond.js'
import { createObjects, revertChange } from './write.js'

/**
 * An agent's change, taken back from either side (tracks A-2).
 *
 * The tools used to tell an agent "undoing once in OpenFrame reverses all of
 * it", which was not true anywhere: a person's undo never held the agent's
 * change, and no tool reached the agent's own. Now every change an agent
 * makes is in the board's change log, where the agent can list and revert it
 * and so can anybody else on the board.
 */

const ACCESS: BoardAccess = {
  boardId: TEST_BOARD,
  title: 'Pricing research',
  role: 'editor',
  accessKey: 'feedfacedeadbeeffeedfacedeadbeef',
}

async function board(options: { role?: 'editor' | 'viewer' } = {}) {
  const room = new BoardRoom()
  const agent = await peerOn(room, { role: options.role ?? 'editor', by: 'Someone' })
  const person = await peerOn(room)
  const context = toolContext(stubAccount([ACCESS]), { open: () => Promise.resolve(agent) })
  return { agent, person, context }
}

function payloadOf(text: string): Record<string, unknown> {
  expect(text.startsWith(FRAMING), text).toBe(true)
  return JSON.parse(text.slice(FRAMING.length)) as Record<string, unknown>
}

const ids = (peer: BoardPeer) => [...peer.store.getDocument().objects.keys()]

async function twoNotes(context: Awaited<ReturnType<typeof board>>['context']) {
  const made = await createObjects.run(
    {
      board: TEST_BOARD,
      objects: [
        { type: 'sticky', x: 0, y: 0 },
        { type: 'sticky', x: 100, y: 0 },
      ],
    },
    context,
  )
  expect(made.isError, made.text).toBe(false)
  await settles()
  return payloadOf(made.text)
}

describe('an agent’s change', () => {
  it('is answered with its id, and no promise that nothing keeps', async () => {
    const { context } = await board()
    const made = await twoNotes(context)
    expect(made.change).toEqual(expect.stringMatching(/\S/))
    expect(JSON.stringify(made)).not.toMatch(/undoing once in OpenFrame/)
    expect(made.undo).toMatch(/revert_change/)
    await context.close()
  })

  it('is listed, with what it did, who did it and what it touched', async () => {
    const { context } = await board()
    const made = await twoNotes(context)

    const listed = await listChanges.run({ board: TEST_BOARD }, context)
    expect(listed.isError, listed.text).toBe(false)
    const [change] = payloadOf(listed.text).changes as Record<string, unknown>[]
    expect(change).toMatchObject({
      id: made.change,
      did: 'Create 2 object(s)',
      by: 'Someone',
      objects: made.objects,
      reverted: null,
    })
    await context.close()
  })

  it('is reverted by the agent, on every peer, and the log says so', async () => {
    const { agent, person, context } = await board()
    const made = await twoNotes(context)
    expect(ids(person)).toHaveLength(2)

    const reverted = await revertChange.run({ board: TEST_BOARD }, context)
    expect(reverted.isError, reverted.text).toBe(false)
    expect(payloadOf(reverted.text)).toMatchObject({ reverted: made.change })
    await settles()

    expect(ids(agent)).toHaveLength(0)
    expect(ids(person)).toHaveLength(0)
    const logged = person.changes().find((change) => change.id === made.change)
    expect(logged?.reverted?.by).toBe('Someone')
    await context.close()
  })

  it('keeps what a person wrote since, and says what it could not take back', async () => {
    const { agent, person, context } = await board()
    const made = await twoNotes(context)
    const [first] = made.objects as string[]
    if (first === undefined) throw new Error('no note')
    const edited = person.dispatcher.dispatch({
      kind: 'UpdateObjectData',
      id: asObjectId(first),
      patch: { text: richFromPlain('mine now') },
    })
    expect(edited.ok).toBe(true)
    await settles()

    const reverted = await revertChange.run({ board: TEST_BOARD, change: made.change }, context)
    expect(reverted.isError, reverted.text).toBe(false)
    expect(payloadOf(reverted.text)).toMatchObject({ kept: [first] })
    await settles()
    expect(ids(agent)).toEqual([first])
    expect(ids(person)).toEqual([first])
    await context.close()
  })

  it('cannot be reverted twice, and says by whom it already was', async () => {
    const { context } = await board()
    const made = await twoNotes(context)
    const once = await revertChange.run({ board: TEST_BOARD, change: made.change }, context)
    expect(once.isError, once.text).toBe(false)
    const again = await revertChange.run({ board: TEST_BOARD, change: made.change }, context)
    expect(again.isError).toBe(true)
    expect(again.text).toMatch(/already.*Someone/)
    await context.close()
  })

  it('names what it cannot find, rather than reverting something else', async () => {
    const { context } = await board()
    await twoNotes(context)
    const missing = await revertChange.run({ board: TEST_BOARD, change: 'txn_nope' }, context)
    expect(missing.isError).toBe(true)
    expect(missing.text).toMatch(/txn_nope/)
    await context.close()
  })

  it('is not reverted by a viewer', async () => {
    const { context } = await board({ role: 'viewer' })
    const refused = await revertChange.run({ board: TEST_BOARD }, context)
    expect(refused.isError).toBe(true)
    expect(refused.text).toMatch(/view-only/i)
    await context.close()
  })
})
