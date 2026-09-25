import { BoardRoom } from '@openframe/collab'
import { describe, expect, it } from 'vitest'

import { openBoard, type BoardPeer } from './board.js'
import { peerOn, settles, TEST_BOARD } from './testing.js'

/**
 * A headless peer against a real `BoardRoom`, joined by a fake socket.
 *
 * The same standing `packages/collab` takes with its own provider tests: one
 * process, no network, and the room is the real one. What a real socket adds
 * is covered where only it can be — `apps/web/e2e-rooms/mcp-peer.spec.ts`
 * runs this against a workerd Durable Object with a browser watching.
 *
 * Nothing here names Yjs, and that is not incidental: `apps/mcp` must be able
 * to hold a board without the CRDT reaching it, which is the same claim the
 * web app makes and the reason `yjs-lives-only-in-collab` is a build failure.
 */

const BOARD = TEST_BOARD

const peer = async (room: BoardRoom, role: 'editor' | 'viewer' = 'editor'): Promise<BoardPeer> =>
  peerOn(room, { role })

function titleOf(held: BoardPeer): string {
  return held.store.getDocument().meta.title
}

function stickyCount(held: BoardPeer): number {
  return [...held.store.getDocument().objects.values()].filter(
    (object) => object.type === 'sticky',
  ).length
}

describe('a headless peer', () => {
  it('reads a board it did not put anything on', async () => {
    const room = new BoardRoom()
    const author = await peer(room)
    author.dispatcher.dispatch(
      {
        kind: 'CreateObjects',
        objects: [{ type: 'sticky', x: 10, y: 20, data: { text: [{ text: 'from the room' }] } }],
      },
      { origin: 'mcp' },
    )
    await settles()

    const reader = await peer(room)
    expect(stickyCount(reader)).toBe(1)
    author.close()
    reader.close()
  })

  it('sends what it dispatches to everyone else on the board', async () => {
    const room = new BoardRoom()
    const watcher = await peer(room)
    const author = await peer(room)

    author.dispatcher.dispatch(
      {
        kind: 'CreateObjects',
        objects: [{ type: 'sticky', x: 0, y: 0, data: { text: [{ text: 'live' }] } }],
      },
      { origin: 'mcp' },
    )
    await settles()

    expect(stickyCount(watcher)).toBe(1)
    watcher.close()
    author.close()
  })

  /**
   * The one thing a peer with no board of its own can silently destroy.
   *
   * A browser publishes its local document into a room it has never held,
   * because that is where the board came from. This process has no board: its
   * document is empty and called `Untitled board`, and publishing it renames
   * the room on the way in.
   *
   * EIGHT joins, because one proves nothing. A seeded title is a write made
   * before the room's state arrives, so it is CONCURRENT with the title
   * already there — and Yjs settles concurrent writes to one key by client
   * id, which is random. A single join with the seeding left on keeps the
   * right title half the time; this test passed that way before the count
   * went up.
   */
  it('never publishes its empty document over the room', async () => {
    const room = new BoardRoom()
    const owner = await peer(room)
    owner.dispatcher.dispatch({ kind: 'SetBoardTitle', title: 'Pricing research' })
    await settles()

    for (let join = 0; join < 8; join++) {
      const agent = await peer(room)
      await settles()
      expect(titleOf(agent), `agent ${String(join)} read the wrong title`).toBe('Pricing research')
      expect(titleOf(owner), `agent ${String(join)} renamed the board`).toBe('Pricing research')
      agent.close()
    }

    owner.close()
  })

  /**
   * The role is the ROOM's answer, and the dispatcher is where it lands.
   *
   * The room refuses a viewer's bytes whatever the client believes —
   * `packages/collab/src/roles.test.ts` is where that is proved. This is the
   * other half: a tool that reported success for work the room was about to
   * drop would be lying to an agent, which then tells a person.
   */
  it('refuses to originate a change on a view-only connection', async () => {
    const room = new BoardRoom()
    const viewer = await peer(room, 'viewer')

    const result = viewer.dispatcher.dispatch(
      {
        kind: 'CreateObjects',
        objects: [{ type: 'sticky', x: 0, y: 0, data: { text: [{ text: 'not allowed' }] } }],
      },
      { origin: 'mcp' },
    )

    expect(result.ok).toBe(false)
    expect(stickyCount(viewer)).toBe(0)
    viewer.close()
  })

  it('gives up rather than reporting an empty board when the room never answers', async () => {
    await expect(
      openBoard({
        boardId: BOARD,
        server: 'ws://room.test',
        syncTimeoutMs: 20,
        // A socket that opens and says nothing, which is what a room that has
        // accepted the upgrade and then wedged looks like from here.
        connect: () => ({
          send: () => undefined,
          close: () => undefined,
          onOpen: (listener) => setTimeout(listener, 0),
          onMessage: () => undefined,
          onClose: () => undefined,
          onError: () => undefined,
        }),
      }),
    ).rejects.toThrow(/did not send the board/)
  })
})
