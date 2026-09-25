import { BoardRoom } from '@openframe/collab'
import type { BoardId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import type { BoardPeer } from '../board.js'
import type { BoardAccess, SignedIn } from '../supabase/account.js'
import { peerOn, settles, TEST_BOARD } from '../testing.js'
import { toolContext } from './context.js'
import { getBoard, getObjects, listBoards, READ_TOOLS, searchBoard } from './read.js'
import { FRAMING } from './respond.js'

/**
 * The read tools, against a real room in this process.
 *
 * Everything an agent can see comes through these, so what they are checked
 * for is what an agent would be misled by: an answer that is not this board,
 * a credential in a payload, and a board too big to hand over in one go.
 */

/** The key nothing may ever print, planted where every tool can reach it. */
const KEY = 'feedfacedeadbeeffeedfacedeadbeef'

const ACCESS: BoardAccess = {
  boardId: TEST_BOARD,
  title: 'Pricing research',
  role: 'editor',
  accessKey: KEY,
}

function accountHolding(
  boards: readonly BoardAccess[],
  peer: (board: BoardAccess) => Promise<BoardPeer>,
) {
  const account: SignedIn = {
    account: { userId: 'user-1', email: 'someone@example.com', displayName: 'Someone' },
    boards: () => Promise.resolve(boards),
    board: (id: BoardId) => Promise.resolve(boards.find((board) => board.boardId === id) ?? null),
    close: () => undefined,
  }
  return toolContext(account, { open: peer })
}

async function boardWith(
  objects: readonly { type: string; text: string; x?: number }[],
): Promise<{ room: BoardRoom; author: BoardPeer }> {
  const room = new BoardRoom()
  const author = await peerOn(room)
  author.dispatcher.dispatch(
    {
      kind: 'CreateObjects',
      objects: objects.map((object, at) => ({
        type: object.type,
        x: object.x ?? at * 200,
        y: 0,
        data: { text: [{ text: object.text }] },
      })),
    },
    { origin: 'mcp' },
  )
  await settles()
  return { room, author }
}

/** The payload of a framed answer. */
function payloadOf(text: string): Record<string, unknown> {
  expect(text.startsWith(FRAMING)).toBe(true)
  return JSON.parse(text.slice(FRAMING.length)) as Record<string, unknown>
}

describe('reading a board', () => {
  it('lists the boards the account can open, and never their keys', async () => {
    const room = new BoardRoom()
    const context = accountHolding([ACCESS], () => peerOn(room))

    const answer = await listBoards.run({}, context)

    expect(answer.text).not.toContain(KEY)
    expect(payloadOf(answer.text)).toEqual({
      boards: [{ id: TEST_BOARD, title: 'Pricing research', role: 'editor' }],
    })
    await context.close()
  })

  it('describes a board without handing over the board', async () => {
    const { room, author } = await boardWith([
      { type: 'sticky', text: 'kumquat' },
      { type: 'sticky', text: 'rhubarb' },
      { type: 'text', text: 'a heading' },
    ])
    const context = accountHolding([ACCESS], () => peerOn(room))

    const payload = payloadOf((await getBoard.run({ board: TEST_BOARD }, context)).text)

    expect(payload.objects).toEqual({ total: 3, byType: { sticky: 2, text: 1 } })
    expect(payload.board).toEqual({ id: TEST_BOARD, title: 'Untitled board' })
    // The shape of the board, not its contents: no object text anywhere in it.
    // A word nothing else could produce, because `not.toContain('one')` would
    // pass on a payload holding the word "none".
    expect(JSON.stringify(payload)).not.toContain('kumquat')
    author.close()
    await context.close()
  })

  it('reads the objects through what each type says about itself', async () => {
    const { room, author } = await boardWith([{ type: 'sticky', text: 'the price is hidden' }])
    const context = accountHolding([ACCESS], () => peerOn(room))

    const payload = payloadOf((await getObjects.run({ board: TEST_BOARD }, context)).text)
    const objects = payload.objects as { type: string; summary: string; fields: unknown }[]

    expect(objects).toHaveLength(1)
    expect(objects[0]?.type).toBe('sticky')
    // `summary` and `fields` are the registry's answer, not this file's idea
    // of what a sticky holds — which is what makes a new type readable here
    // without a line changing.
    expect(objects[0]?.summary).toBe('the price is hidden')
    expect(objects[0]?.fields).toEqual({ text: 'the price is hidden' })
    author.close()
    await context.close()
  })

  /**
   * A board can hold ten thousand objects and a context window cannot. The
   * cursor is the last id of the page, so the next call resumes in the board's
   * own order rather than at an index that moves when somebody adds a note.
   */
  it('hands over a big board a page at a time', async () => {
    const { room, author } = await boardWith(
      Array.from({ length: 7 }, (_at, index) => ({ type: 'sticky', text: `note ${String(index)}` })),
    )
    const context = accountHolding([ACCESS], () => peerOn(room))

    const first = payloadOf((await getObjects.run({ board: TEST_BOARD, limit: 3 }, context)).text)
    expect(first.total).toBe(7)
    expect(first.objects).toHaveLength(3)
    expect(first.next).not.toBeNull()

    const second = payloadOf(
      (await getObjects.run({ board: TEST_BOARD, limit: 3, cursor: first.next }, context)).text,
    )
    const firstIds = (first.objects as { id: string }[]).map((object) => object.id)
    const secondIds = (second.objects as { id: string }[]).map((object) => object.id)
    expect(secondIds).toHaveLength(3)
    expect(secondIds.some((id) => firstIds.includes(id))).toBe(false)

    const last = payloadOf(
      (await getObjects.run({ board: TEST_BOARD, limit: 3, cursor: second.next }, context)).text,
    )
    expect(last.objects).toHaveLength(1)
    // Nothing left, and it says so rather than handing back a cursor that
    // answers with an empty page forever.
    expect(last.next).toBeNull()
    author.close()
    await context.close()
  })

  it('reads named objects, and says which of them are not there', async () => {
    const { room, author } = await boardWith([
      { type: 'sticky', text: 'kept' },
      { type: 'text', text: 'a heading' },
    ])
    const context = accountHolding([ACCESS], () => peerOn(room))
    const all = payloadOf((await getObjects.run({ board: TEST_BOARD }, context)).text)
    const [first] = all.objects as { id: string }[]

    const payload = payloadOf(
      (await getObjects.run({ board: TEST_BOARD, ids: [first?.id ?? '', 'obj_gone'] }, context))
        .text,
    )

    expect(payload.objects).toHaveLength(1)
    /*
     * Named explicitly, so a missing one is worth saying: an agent that asked
     * for three objects and got two would otherwise have to diff the lists to
     * find out which, and would probably assume the board changed under it.
     */
    expect(payload.missing).toEqual(['obj_gone'])
    author.close()
    await context.close()
  })

  it('reads one kind of object at a time when asked to', async () => {
    const { room, author } = await boardWith([
      { type: 'sticky', text: 'a note' },
      { type: 'text', text: 'a heading' },
      { type: 'sticky', text: 'another note' },
    ])
    const context = accountHolding([ACCESS], () => peerOn(room))

    const payload = payloadOf(
      (await getObjects.run({ board: TEST_BOARD, type: 'sticky' }, context)).text,
    )

    expect(payload.total).toBe(2)
    expect((payload.objects as { type: string }[]).every((object) => object.type === 'sticky')).toBe(true)
    author.close()
    await context.close()
  })

  it('finds objects by what the type says is worth searching', async () => {
    const room = new BoardRoom()
    const author = await peerOn(room)
    author.dispatcher.dispatch(
      {
        kind: 'CreateObjects',
        objects: [
          { type: 'sticky', x: 0, y: 0, data: { text: [{ text: 'checkout is slow' }] } },
          {
            type: 'evidence',
            x: 300,
            y: 0,
            data: {
              text: [{ text: 'they gave up at the price step' }],
              source: 'September study',
              participant: 'P4',
              tags: [],
            },
          },
        ],
      },
      { origin: 'mcp' },
    )
    await settles()
    const context = accountHolding([ACCESS], () => peerOn(room))

    const byText = payloadOf((await searchBoard.run({ board: TEST_BOARD, query: 'checkout' }, context)).text)
    expect(byText.total).toBe(1)

    /*
     * The source, which is not the text. A search that only read the body
     * would answer "nothing" to "what did we learn in the September study?" —
     * and the type already says the source is worth searching.
     */
    const bySource = payloadOf(
      (await searchBoard.run({ board: TEST_BOARD, query: 'september study' }, context)).text,
    )
    expect(bySource.total).toBe(1)
    expect((bySource.objects as { type: string }[])[0]?.type).toBe('evidence')
    author.close()
    await context.close()
  })
})

describe('what a tool will not do', () => {
  it('answers the same way for a board that is not yours and one that is not there', async () => {
    const room = new BoardRoom()
    const context = accountHolding([ACCESS], () => peerOn(room))

    const somebodyElses = await getBoard.run({ board: 'brd_somebodyelses1' }, context)
    const madeUp = await getBoard.run({ board: 'brd_nosuchboard0001' }, context)

    expect(somebodyElses.isError).toBe(true)
    expect(somebodyElses.text).toBe(madeUp.text)
    await context.close()
  })

  it('says to sign in rather than reaching for a board', async () => {
    const context = toolContext(null, {
      open: () => Promise.reject(new Error('a signed-out tool must not open anything')),
    })

    for (const tool of READ_TOOLS) {
      const answer = await tool.run({ board: TEST_BOARD, query: 'anything' }, context)
      expect(answer.isError, `${tool.name} tried to answer signed out`).toBe(true)
      expect(answer.text).toMatch(/not signed in/i)
    }
    await context.close()
  })

  it('refuses a request that is not shaped like one', async () => {
    const room = new BoardRoom()
    const context = accountHolding([ACCESS], () => peerOn(room))

    const noBoard = await getObjects.run({}, context)
    const silly = await getObjects.run({ board: TEST_BOARD, limit: 10_000 }, context)

    expect(noBoard.isError).toBe(true)
    expect(silly.isError).toBe(true)
    await context.close()
  })

  /**
   * The standing guard of the stage, over every tool at once: a board's key is
   * in the account this context holds, and none of these may put it in an
   * answer. Written here rather than in each test so a tool added later is
   * covered by being added to `READ_TOOLS`.
   */
  it('never puts a board key in an answer', async () => {
    const { room, author } = await boardWith([{ type: 'sticky', text: 'anything' }])
    const context = accountHolding([ACCESS], () => peerOn(room))

    const everything: string[] = []
    for (const tool of READ_TOOLS) {
      everything.push((await tool.run({ board: TEST_BOARD, query: 'anything' }, context)).text)
    }

    expect(everything.join('\n')).not.toContain(KEY)
    expect(everything.join('\n')).not.toContain(KEY.slice(0, 8))
    author.close()
    await context.close()
  })
})

describe('the board a tool opens', () => {
  it('joins the room once, however many questions are asked', async () => {
    const room = new BoardRoom()
    let joins = 0
    const context = accountHolding([ACCESS], () => {
      joins += 1
      return peerOn(room)
    })

    await getBoard.run({ board: TEST_BOARD }, context)
    await getObjects.run({ board: TEST_BOARD }, context)
    await searchBoard.run({ board: TEST_BOARD, query: 'anything' }, context)

    expect(joins).toBe(1)
    await context.close()
  })

  it('does not remember a room it failed to join', async () => {
    const room = new BoardRoom()
    let attempts = 0
    const context = accountHolding([ACCESS], () => {
      attempts += 1
      return attempts === 1 ? Promise.reject(new Error('the room was down')) : peerOn(room)
    })

    await expect(getBoard.run({ board: TEST_BOARD }, context)).rejects.toThrow(/room was down/)
    // The second attempt gets a room, rather than the first attempt's failure
    // for the life of the process.
    expect((await getBoard.run({ board: TEST_BOARD }, context)).isError).toBe(false)
    expect(attempts).toBe(2)
    await context.close()
  })
})

describe('the tools themselves', () => {
  it('each say what they are for', () => {
    for (const tool of READ_TOOLS) {
      expect(tool.name, 'a tool name is what an agent calls').toMatch(/^[a-z_]+$/)
      expect(tool.description.length, `${tool.name} has no description`).toBeGreaterThan(40)
    }
    expect(READ_TOOLS.map((tool) => tool.name)).toEqual([
      'list_boards',
      'get_board',
      'get_objects',
      'search_board',
    ])
  })
})
