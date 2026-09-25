import { readdirSync, readFileSync } from 'node:fs'
import { BoardRoom } from '@openframe/collab'
import { describe, expect, it } from 'vitest'

import type { BoardPeer } from '../board.js'
import type { BoardAccess, NewComment } from '../supabase/account.js'
import { peerOn, settles, stubAccount, TEST_BOARD } from '../testing.js'
import { toolContext } from './context.js'
import { getObjects } from './read.js'
import { FRAMING } from './respond.js'
import {
  addComment,
  createConnector,
  createFrame,
  createObjects,
  deleteObjects,
  moveObjects,
  updateObject,
  WRITE_TOOLS,
} from './write.js'

/**
 * What an agent may change, and the four things that must stay true while it
 * does: one undo entry per call, a viewer refused, an origin on every change,
 * and no way to the document except the dispatcher.
 */

const ACCESS: BoardAccess = {
  boardId: TEST_BOARD,
  title: 'Pricing research',
  role: 'editor',
  accessKey: 'feedfacedeadbeeffeedfacedeadbeef',
}

async function board(options: { role?: 'editor' | 'viewer' } = {}) {
  const room = new BoardRoom()
  const peer = await peerOn(room, { role: options.role ?? 'editor' })
  const said: NewComment[] = []
  const context = toolContext(stubAccount([ACCESS], said), { open: () => Promise.resolve(peer) })
  return { room, peer, context, said }
}

function payloadOf(text: string): Record<string, unknown> {
  expect(text.startsWith(FRAMING)).toBe(true)
  return JSON.parse(text.slice(FRAMING.length)) as Record<string, unknown>
}

function objectsOn(peer: BoardPeer) {
  return [...peer.store.getDocument().objects.values()]
}

const note = (text: string, x = 0) => ({
  type: 'sticky',
  x,
  y: 0,
  data: { text: [{ text }] },
})

describe('changing a board', () => {
  it('creates what it was asked for, through the dispatcher', async () => {
    const { peer, context } = await board()

    const answer = await createObjects.run(
      { board: TEST_BOARD, objects: [note('one'), note('two', 300)] },
      context,
    )

    const payload = payloadOf(answer.text)
    expect(objectsOn(peer)).toHaveLength(2)
    expect(payload.objects).toHaveLength(2)
    // The stamp the dispatcher puts on: an agent's work is distinguishable
    // from a person's on any board it touches.
    expect(objectsOn(peer).every((object) => object.meta.createdVia === 'mcp')).toBe(true)
    await context.close()
  })

  it('changes what an object says without being told the rest of it', async () => {
    const { peer, context } = await board()
    await createObjects.run({ board: TEST_BOARD, objects: [note('before')] }, context)
    const [made] = objectsOn(peer)

    await updateObject.run(
      { board: TEST_BOARD, id: made?.id, data: { text: [{ text: 'after' }] } },
      context,
    )

    const payload = payloadOf((await getObjects.run({ board: TEST_BOARD }, context)).text)
    expect((payload.objects as { summary: string }[])[0]?.summary).toBe('after')
    await context.close()
  })

  /**
   * Absolute coordinates in, deltas out. An agent reads positions rather than
   * feeling them, so asking it to subtract would be asking it to re-derive a
   * number it already has — against a board that may have moved since.
   */
  it('puts objects where it is told, in the coordinates it was given', async () => {
    const { peer, context } = await board()
    await createObjects.run({ board: TEST_BOARD, objects: [note('here', 100)] }, context)
    const [made] = objectsOn(peer)

    await moveObjects.run(
      { board: TEST_BOARD, moves: [{ id: made?.id, x: 640, y: 480 }] },
      context,
    )

    const moved = peer.store.getDocument().objects.get(made?.id ?? made!.id)
    expect(moved?.frame.x).toBe(640)
    expect(moved?.frame.y).toBe(480)
    await context.close()
  })

  it('says which objects it could not find rather than moving the rest quietly', async () => {
    const { peer, context } = await board()
    await createObjects.run({ board: TEST_BOARD, objects: [note('here')] }, context)
    const [made] = objectsOn(peer)

    const payload = payloadOf(
      (
        await moveObjects.run(
          {
            board: TEST_BOARD,
            moves: [
              { id: made?.id, x: 10, y: 10 },
              { id: 'obj_notthere', x: 20, y: 20 },
            ],
          },
          context,
        )
      ).text,
    )

    expect(payload.missing).toEqual(['obj_notthere'])
    await context.close()
  })

  it('deletes', async () => {
    const { peer, context } = await board()
    await createObjects.run({ board: TEST_BOARD, objects: [note('gone')] }, context)
    const [made] = objectsOn(peer)

    await deleteObjects.run({ board: TEST_BOARD, ids: [made?.id] }, context)

    expect(objectsOn(peer)).toHaveLength(0)
    await context.close()
  })

  it('joins two objects with a line that follows them', async () => {
    const { peer, context } = await board()
    await createObjects.run(
      { board: TEST_BOARD, objects: [note('from'), note('to', 400)] },
      context,
    )
    const [from, to] = objectsOn(peer)

    await createConnector.run(
      { board: TEST_BOARD, from: { objectId: from?.id }, to: { objectId: to?.id }, text: 'causes' },
      context,
    )

    const connector = objectsOn(peer).find((object) => object.type === 'connector')
    expect(connector).toBeDefined()
    const data = connector?.data as {
      from: { kind: string; objectId: string }
      text: readonly { text: string }[]
    }
    // ATTACHED, not placed at the object's coordinates: an end that is
    // attached moves with what it is attached to, which is the whole
    // difference between a connector and a line.
    expect(data.from.kind).toBe('object')
    expect(data.from.objectId).toBe(from?.id)
    // The label is rich text (ADR 0014); the agent named it in words.
    expect(data.text).toEqual([{ text: 'causes' }])
    await context.close()
  })
})

describe('one tool call is one undo entry', () => {
  it('puts back everything a single call created', async () => {
    const { peer, context } = await board()

    await createObjects.run(
      { board: TEST_BOARD, objects: [note('one'), note('two', 300), note('three', 600)] },
      context,
    )
    expect(objectsOn(peer)).toHaveLength(3)

    peer.dispatcher.undo()

    expect(objectsOn(peer)).toHaveLength(0)
    // And nothing left behind it: three objects were one entry, not three.
    expect(peer.dispatcher.undoStack.canUndo).toBe(false)
    await context.close()
  })

  /**
   * The case that needs two commands. A frame that swallowed six notes has to
   * give back the six notes as well as remove itself, or undo leaves a board
   * that looks right and has lost its structure.
   */
  it('puts back a frame and what it swallowed, in one press', async () => {
    const { peer, context } = await board()
    await createObjects.run(
      { board: TEST_BOARD, objects: [note('inside'), note('also inside', 200)] },
      context,
    )
    const loose = objectsOn(peer).map((object) => object.id)
    // The notes were one entry; the frame is the next one.
    expect(peer.dispatcher.undoStack.canUndo).toBe(true)

    await createFrame.run(
      {
        board: TEST_BOARD,
        name: 'Findings',
        x: 0,
        y: 0,
        width: 800,
        height: 600,
        contains: loose,
      },
      context,
    )
    expect(objectsOn(peer).filter((object) => object.parentId !== null)).toHaveLength(2)

    peer.dispatcher.undo()

    expect(objectsOn(peer).some((object) => object.type === 'frame')).toBe(false)
    expect(objectsOn(peer).every((object) => object.parentId === null)).toBe(true)
    expect(objectsOn(peer)).toHaveLength(2)
    await context.close()
  })

  it('is one entry even when a call changes an object two ways', async () => {
    const { peer, context } = await board()
    await createObjects.run({ board: TEST_BOARD, objects: [note('before')] }, context)
    const [made] = objectsOn(peer)
    peer.dispatcher.undo()
    peer.dispatcher.redo()

    await updateObject.run(
      {
        board: TEST_BOARD,
        id: made?.id,
        data: { text: [{ text: 'after' }] },
        style: { color: 'blue' },
      },
      context,
    )
    peer.dispatcher.undo()

    const back = peer.store.getDocument().objects.get(made!.id)
    expect(back?.style.color).not.toBe('blue')
    await context.close()
  })
})

describe('a view-only board', () => {
  /**
   * Refused HERE as well as by the room and by the dispatcher. All three would
   * stop the write; only this one tells the agent, and an agent told nothing
   * tries again.
   */
  it('refuses every tool that would change it', async () => {
    const { peer, context } = await board({ role: 'viewer' })

    for (const tool of WRITE_TOOLS) {
      if (tool.name === 'add_comment') continue
      const answer = await tool.run(
        {
          board: TEST_BOARD,
          objects: [note('not allowed')],
          ids: ['obj_anything'],
          moves: [{ id: 'obj_anything', x: 0, y: 0 }],
          id: 'obj_anything',
          data: { text: [{ text: 'no' }] },
          from: { x: 0, y: 0 },
          to: { x: 10, y: 10 },
          name: 'nope',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
        },
        context,
      )
      expect(answer.isError, `${tool.name} did not refuse a viewer`).toBe(true)
      expect(answer.text).toMatch(/view-only/i)
    }

    expect(objectsOn(peer)).toHaveLength(0)
    expect(peer.dispatcher.undoStack.canUndo).toBe(false)
    await context.close()
  })

  /**
   * Except a comment, which is what a viewer MAY do: `readOnlyCapabilities`
   * has granted `comment` since phase 1, and a remark is not part of the
   * document at all.
   */
  it('still takes a comment', async () => {
    const { context, said } = await board({ role: 'viewer' })

    const answer = await addComment.run(
      { board: TEST_BOARD, body: 'this column looks thin' },
      context,
    )

    expect(answer.isError).toBe(false)
    expect(said).toHaveLength(1)
    await context.close()
  })
})

describe('a comment', () => {
  it('goes to the discussion, not into the document', async () => {
    const { peer, context, said } = await board()

    await addComment.run(
      { board: TEST_BOARD, body: 'is this still true?', x: 120, y: 240 },
      context,
    )
    await settles()

    expect(said[0]?.body).toBe('is this still true?')
    expect(said[0]?.at).toEqual({ x: 120, y: 240 })
    // Nothing on the board, and nothing to undo: a remark in the CRDT would be
    // in undo, in export, in search and in the registry.
    expect(objectsOn(peer)).toHaveLength(0)
    expect(peer.dispatcher.undoStack.canUndo).toBe(false)
    await context.close()
  })

  it('pins to the middle of what it is about', async () => {
    const { peer, context, said } = await board()
    await createObjects.run({ board: TEST_BOARD, objects: [note('about this')] }, context)
    const [made] = objectsOn(peer)

    await addComment.run(
      { board: TEST_BOARD, body: 'about this one', objectId: made?.id },
      context,
    )

    expect(said[0]?.objectId).toBe(made?.id)
    expect(said[0]?.on).toEqual({ fx: 0.5, fy: 0.5 })
    await context.close()
  })
})

describe('the one way to the document', () => {
  /**
   * Rule 3, as a test rather than a promise. `DocumentWriter` is held only by
   * `board.ts`, where the store is built — so a tool cannot reach it, and a
   * later one cannot either without this failing.
   *
   * A source scan, because what is being checked is that something is ABSENT:
   * a behavioural test can only find the paths somebody thought to write.
   */
  it('is the only one any tool has', () => {
    const root = new URL('.', import.meta.url)
    for (const file of readdirSync(root).filter((name) => name.endsWith('.ts'))) {
      if (file.endsWith('.test.ts')) continue
      const source = readFileSync(new URL(file, root), 'utf8')
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(code, `${file} builds its own store`).not.toContain('createDocumentStore')
      expect(code, `${file} names a writer`).not.toMatch(/\bwriter\b/)
      expect(code, `${file} applies patches itself`).not.toContain('applyPatches')
    }
  })

  it('leaves no writer on a board a tool is handed', async () => {
    const { peer, context } = await board()
    expect(Object.keys(peer)).not.toContain('writer')
    expect('writer' in peer.store).toBe(false)
    await context.close()
  })
})
