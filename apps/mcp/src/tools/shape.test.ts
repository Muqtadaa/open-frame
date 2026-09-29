import { BoardRoom } from '@openframe/collab'
import { describe, expect, it } from 'vitest'

import type { BoardPeer } from '../board.js'
import type { BoardAccess } from '../supabase/account.js'
import { peerOn, stubAccount, TEST_BOARD } from '../testing.js'
import { toolContext } from './context.js'
import { FRAMING } from './respond.js'
import {
  alignObjects,
  createObjects,
  deriveObject,
  distributeObjects,
  duplicateObjects,
  groupObjects,
  ungroupObjects,
} from './write.js'

/**
 * The edits that are several changes to the document and one thing to a
 * person — group, ungroup, align, distribute, duplicate, derive. Each is one
 * core command, so an agent gets the same rules the board's own menu does,
 * and one call is one change to revert.
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

function payloadOf(text: string): Record<string, unknown> {
  expect(text.startsWith(FRAMING)).toBe(true)
  return JSON.parse(text.slice(FRAMING.length)) as Record<string, unknown>
}

const objectsOn = (peer: BoardPeer) => [...peer.store.getDocument().objects.values()]

async function make(
  context: Awaited<ReturnType<typeof board>>['context'],
  objects: readonly { type: string; x: number; y: number }[],
): Promise<string[]> {
  const answer = await createObjects.run({ board: TEST_BOARD, objects }, context)
  expect(answer.isError, answer.text).toBeFalsy()
  return payloadOf(answer.text).objects as string[]
}

describe('group_objects and ungroup_objects', () => {
  it('groups, names the group, and is one change to undo', async () => {
    const { peer, context } = await board()
    const ids = await make(context, [
      { type: 'sticky', x: 0, y: 0 },
      { type: 'sticky', x: 300, y: 0 },
    ])

    const answer = await groupObjects.run({ board: TEST_BOARD, ids }, context)
    expect(answer.isError, answer.text).toBeFalsy()
    const payload = payloadOf(answer.text)
    expect(payload.did).toBe('Group')
    const group = objectsOn(peer).find((object) => object.type === 'group')
    expect(payload.group).toBe(group?.id)
    expect(objectsOn(peer).filter((object) => object.parentId === group?.id)).toHaveLength(2)

    peer.dispatcher.undo()
    expect(objectsOn(peer).some((object) => object.type === 'group')).toBe(false)
    await context.close()
  })

  it('refuses objects in different places, in words', async () => {
    const { context } = await board()
    const [frame] = await make(context, [{ type: 'frame', x: 0, y: 0 }])
    const [loose] = await make(context, [{ type: 'sticky', x: 900, y: 900 }])
    const inside = await createObjects.run(
      { board: TEST_BOARD, objects: [{ type: 'sticky', x: 10, y: 10, parentId: frame }] },
      context,
    )
    const [held] = payloadOf(inside.text).objects as string[]

    const answer = await groupObjects.run({ board: TEST_BOARD, ids: [held, loose] }, context)
    expect(answer.isError).toBe(true)
    expect(answer.text).toMatch(/same place/)
    await context.close()
  })

  it('ungroups, keeping what the group held', async () => {
    const { peer, context } = await board()
    const ids = await make(context, [
      { type: 'sticky', x: 0, y: 0 },
      { type: 'sticky', x: 300, y: 0 },
    ])
    const grouped = payloadOf((await groupObjects.run({ board: TEST_BOARD, ids }, context)).text)

    const answer = await ungroupObjects.run(
      { board: TEST_BOARD, ids: [grouped.group as string] },
      context,
    )
    expect(answer.isError, answer.text).toBeFalsy()
    expect(objectsOn(peer).map((object) => object.type)).toEqual(['sticky', 'sticky'])
    expect(objectsOn(peer).every((object) => object.parentId === null)).toBe(true)
    await context.close()
  })
})

describe('align_objects and distribute_objects', () => {
  // Off the grid, so only the selection's own edge could put it there.
  it('lines objects up on the edge asked for', async () => {
    const { peer, context } = await board()
    const ids = await make(context, [
      { type: 'sticky', x: 37, y: 0 },
      { type: 'sticky', x: 213, y: 300 },
    ])
    const answer = await alignObjects.run({ board: TEST_BOARD, ids, edge: 'left' }, context)
    expect(answer.isError, answer.text).toBeFalsy()
    expect(payloadOf(answer.text).did).toBe('Align left')
    expect(objectsOn(peer).map((object) => object.frame.x)).toEqual([37, 37])
    await context.close()
  })

  it('evens out the gaps between three', async () => {
    const { peer, context } = await board()
    const ids = await make(context, [
      { type: 'sticky', x: 0, y: 0 },
      { type: 'sticky', x: 137, y: 0 },
      { type: 'sticky', x: 700, y: 0 },
    ])
    const answer = await distributeObjects.run({ board: TEST_BOARD, ids, axis: 'x' }, context)
    expect(answer.isError, answer.text).toBeFalsy()
    const [a, b, c] = objectsOn(peer).map((object) => object.frame)
    if (a === undefined || b === undefined || c === undefined) throw new Error('expected three')
    expect(b.x - (a.x + a.width)).toBeCloseTo(c.x - (b.x + b.width))
    await context.close()
  })

  it('refuses fewer than three to distribute', async () => {
    const { context } = await board()
    const ids = await make(context, [
      { type: 'sticky', x: 0, y: 0 },
      { type: 'sticky', x: 300, y: 0 },
    ])
    const answer = await distributeObjects.run({ board: TEST_BOARD, ids, axis: 'x' }, context)
    expect(answer.isError).toBe(true)
    await context.close()
  })
})

describe('duplicate_objects', () => {
  it('makes copies beside the originals and says which they are', async () => {
    const { peer, context } = await board()
    const [original] = await make(context, [{ type: 'sticky', x: 40, y: 40 }])
    const answer = await duplicateObjects.run({ board: TEST_BOARD, ids: [original] }, context)
    expect(answer.isError, answer.text).toBeFalsy()
    const [copy] = payloadOf(answer.text).objects as string[]
    expect(copy).not.toBe(original)
    const made = objectsOn(peer).find((object) => object.id === copy)
    expect(made?.frame.x).toBe(64)
    await context.close()
  })
})

describe('derive_object', () => {
  it('stands an insight on the evidence it cites, and names it', async () => {
    const { peer, context } = await board()
    const sources = await make(context, [
      { type: 'evidence', x: 0, y: 0 },
      { type: 'evidence', x: 300, y: 0 },
    ])
    const answer = await deriveObject.run(
      { board: TEST_BOARD, toType: 'insight', from: sources, predicate: 'cites', x: 100, y: -300 },
      context,
    )
    expect(answer.isError, answer.text).toBeFalsy()
    const derived = payloadOf(answer.text).derived as string
    expect(objectsOn(peer).find((object) => object.id === derived)?.type).toBe('insight')
    const relations = objectsOn(peer).filter((object) => object.type === 'relation')
    expect(relations.map((relation) => relation.data)).toEqual(
      sources.map((to) => ({ from: derived, to, predicate: 'cites' })),
    )
    await context.close()
  })

  /** Provenance nothing declares is refused, with the board left as it was. */
  it('refuses a pairing the source type does not declare', async () => {
    const { peer, context } = await board()
    const [sticky] = await make(context, [{ type: 'sticky', x: 0, y: 0 }])
    const answer = await deriveObject.run(
      { board: TEST_BOARD, toType: 'task', from: [sticky], predicate: 'implements', x: 0, y: -300 },
      context,
    )
    expect(answer.isError).toBe(true)
    expect(answer.text).toMatch(/cannot be the source/)
    expect(objectsOn(peer)).toHaveLength(1)
    await context.close()
  })
})

describe('what an agent is told', () => {
  /**
   * An arrangement that moves nothing records no change, so there is nothing
   * to revert — and an answer offering a change id to revert would send the
   * agent after a change that does not exist.
   */
  it('says so when nothing needed doing, and offers nothing to revert', async () => {
    const { context } = await board()
    const ids = await make(context, [
      { type: 'sticky', x: 37, y: 0 },
      { type: 'sticky', x: 37, y: 300 },
    ])
    const answer = await alignObjects.run({ board: TEST_BOARD, ids, edge: 'left' }, context)
    expect(answer.isError, answer.text).toBeFalsy()
    const payload = payloadOf(answer.text)
    expect(payload.change).toBeUndefined()
    expect(payload.undo).toBeUndefined()
    expect(payload.changed).toBe(false)
    await context.close()
  })

  /** Two copies of one id are one object, not two. */
  it('refuses the same object named twice', async () => {
    const { peer, context } = await board()
    const [only] = await make(context, [{ type: 'sticky', x: 0, y: 0 }])
    const answer = await groupObjects.run({ board: TEST_BOARD, ids: [only, only] }, context)
    expect(answer.isError).toBe(true)
    expect(answer.text).toMatch(/more than once/)
    expect(objectsOn(peer).some((object) => object.type === 'group')).toBe(false)
    await context.close()
  })
})
