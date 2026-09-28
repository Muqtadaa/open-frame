import { BoardRoom } from '@openframe/collab'
import { describe, expect, it } from 'vitest'

import type { BoardPeer } from '../board.js'
import type { BoardAccess } from '../supabase/account.js'
import { peerOn, stubAccount, TEST_BOARD, VALID_CALL, validCall } from '../testing.js'
import { toolContext } from './context.js'
import type { ToolDefinition } from './definition.js'
import { READ_TOOLS } from './read.js'
import { createConnector, createObjects, deleteObjects, moveObjects, updateObject, WRITE_TOOLS } from './write.js'

/**
 * Every tool's contract at its edge (tracks A-4 and B-1).
 *
 * What a tool takes is its public API, and an agent only learns it from what
 * the tool refuses. Two things were wrong at that edge:
 * - A key a schema did not know was STRIPPED rather than refused, so a
 *   misspelt `colour` was dropped, the call succeeded, and the agent believed
 *   the note was blue. The same trap as the `z.object({})` rule 23 records.
 * - A colour was never checked at all, so `url(https://…)` went onto the
 *   board and into every viewer's CSS.
 * Locks and the size limits had no test either.
 */

const ACCESS: BoardAccess = {
  boardId: TEST_BOARD,
  title: 'Pricing research',
  role: 'editor',
  accessKey: 'feedfacedeadbeeffeedfacedeadbeef',
}

async function board() {
  const room = new BoardRoom()
  const peer = await peerOn(room, { role: 'editor' })
  const context = toolContext(stubAccount([ACCESS], []), { open: () => Promise.resolve(peer) })
  return { peer, context }
}

const objectsOn = (peer: BoardPeer) => [...peer.store.getDocument().objects.values()]

async function oneNote(peer: BoardPeer, context: Awaited<ReturnType<typeof board>>['context']) {
  const made = await createObjects.run(
    { board: TEST_BOARD, objects: [{ type: 'sticky', x: 0, y: 0 }] },
    context,
  )
  expect(made.isError, made.text).toBe(false)
  const [note] = objectsOn(peer)
  if (note === undefined) throw new Error('no note')
  return note
}

const TOOLS: readonly ToolDefinition[] = [...READ_TOOLS, ...WRITE_TOOLS]

describe('every tool refuses a key it does not know', () => {
  it('covers every tool there is', () => {
    expect(TOOLS.map((tool) => tool.name).sort()).toEqual(Object.keys(VALID_CALL).sort())
  })

  for (const tool of TOOLS) {
    it(`${tool.name} answers a misspelt argument with a refusal, and changes nothing`, async () => {
      const { peer, context } = await board()
      const note = await oneNote(peer, context)
      const before = JSON.stringify(objectsOn(peer))

      const answer = await tool.run({ ...validCall(tool.name, note.id), colour: 'blue' }, context)

      expect(answer.isError, answer.text).toBe(true)
      expect(answer.text).toMatch(/colour/)
      expect(JSON.stringify(objectsOn(peer))).toBe(before)
      await context.close()
    })
  }

  it('refuses one inside an object, too', async () => {
    const { peer, context } = await board()
    const answer = await createObjects.run(
      { board: TEST_BOARD, objects: [{ type: 'sticky', x: 0, y: 0, colr: 'blue' }] },
      context,
    )
    expect(answer.isError, answer.text).toBe(true)
    expect(objectsOn(peer)).toHaveLength(0)

    const moved = await moveObjects.run(
      { board: TEST_BOARD, moves: [{ id: 'obj_x', x: 0, y: 0, z: 1 }] },
      context,
    )
    expect(moved.isError).toBe(true)

    const joined = await createConnector.run(
      { board: TEST_BOARD, from: { x: 0, y: 0, side: 'left' }, to: { x: 1, y: 1 } },
      context,
    )
    expect(joined.isError).toBe(true)
    await context.close()
  })
})

describe('a colour must be one', () => {
  const HOSTILE = ['url(https://example.com/pixel)', 'red; background: black']

  for (const value of HOSTILE) {
    it(`create_objects refuses ${value}`, async () => {
      const { peer, context } = await board()
      const answer = await createObjects.run(
        { board: TEST_BOARD, objects: [{ type: 'sticky', x: 0, y: 0, style: { color: value } }] },
        context,
      )
      expect(answer.isError, answer.text).toBe(true)
      expect(objectsOn(peer)).toHaveLength(0)
      await context.close()
    })

    it(`update_object refuses ${value}`, async () => {
      const { peer, context } = await board()
      const note = await oneNote(peer, context)
      const answer = await updateObject.run(
        { board: TEST_BOARD, id: note.id, style: { color: value } },
        context,
      )
      expect(answer.isError, answer.text).toBe(true)
      expect(objectsOn(peer)[0]?.style.color).toBeUndefined()
      await context.close()
    })
  }
})

describe('a locked object', () => {
  it('is not changed, moved or deleted by an agent', async () => {
    const { peer, context } = await board()
    const note = await oneNote(peer, context)
    peer.dispatcher.dispatch({ kind: 'SetLocked', ids: [note.id], locked: true })
    const before = JSON.stringify(objectsOn(peer))

    for (const [tool, args] of [
      [updateObject, { board: TEST_BOARD, id: note.id, style: { color: 'blue' } }],
      [moveObjects, { board: TEST_BOARD, moves: [{ id: note.id, x: 500, y: 500 }] }],
      [deleteObjects, { board: TEST_BOARD, ids: [note.id] }],
    ] as const) {
      const answer = await tool.run(args, context)
      expect(answer.isError, `${tool.name}: ${answer.text}`).toBe(true)
      expect(answer.text).toMatch(/locked/)
    }
    expect(JSON.stringify(objectsOn(peer))).toBe(before)
    await context.close()
  })
})

describe('the size of one call', () => {
  it('creates at most 200 objects', async () => {
    const { peer, context } = await board()
    const objects = Array.from({ length: 201 }, (_, index) => ({ type: 'sticky', x: index, y: 0 }))
    const answer = await createObjects.run({ board: TEST_BOARD, objects }, context)
    expect(answer.isError).toBe(true)
    expect(objectsOn(peer)).toHaveLength(0)
    await context.close()
  })

  it('moves and deletes at most 500', async () => {
    const { context } = await board()
    const ids = Array.from({ length: 501 }, (_, index) => `obj_${String(index)}`)
    expect((await deleteObjects.run({ board: TEST_BOARD, ids }, context)).isError).toBe(true)
    const moves = ids.map((id) => ({ id, x: 0, y: 0 }))
    expect((await moveObjects.run({ board: TEST_BOARD, moves }, context)).isError).toBe(true)
    await context.close()
  })
})
