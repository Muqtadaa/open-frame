import { BoardRoom, type RoomPeer, type RoomRole, type RoomSocket } from '@openframe/collab'
import { asBoardId, type BoardId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { openBoard, type BoardPeer } from './board.js'

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

/** A socket pair: one end the peer's, the other the room's. */
class Wire {
  #messageListeners: ((data: Uint8Array) => void)[] = []
  #room: BoardRoom | null = null
  #peer: RoomPeer | null = null

  readonly client: RoomSocket = {
    send: (data) => {
      if (this.#room === null || this.#peer === null) return
      this.#room.receive(this.#peer, data)
    },
    close: () => {
      if (this.#room !== null && this.#peer !== null) this.#room.leave(this.#peer)
      this.#room = null
    },
    onOpen: (listener) => {
      // On the next turn, not now: `connect()` is called during `start()` and
      // a socket that opened synchronously would call back into a provider
      // that has not finished starting.
      setTimeout(listener, 0)
    },
    onMessage: (listener) => this.#messageListeners.push(listener),
    onClose: () => undefined,
    onError: () => undefined,
  }

  connectTo(room: BoardRoom, id: string, role: RoomRole): void {
    this.#room = room
    this.#peer = {
      id,
      role,
      send: (data) => {
        for (const listener of this.#messageListeners) listener(data)
      },
    }
    room.join(this.#peer)
  }
}

const BOARD = asBoardId('brd_mcpstage1test')

let joined = 0

/** A peer on the room, connected the way the socket adapter would connect it. */
async function peer(
  room: BoardRoom,
  role: RoomRole = 'editor',
  boardId: BoardId = BOARD,
): Promise<BoardPeer> {
  const id = `peer-${String(++joined)}`
  return openBoard({
    boardId,
    server: 'ws://room.test',
    connect: () => {
      const wire = new Wire()
      /*
       * After the provider has its listeners on, which is what a real upgrade
       * gives for free: the room speaks first, so a join that ran inside
       * `connect()` would send the board to nobody.
       */
      setTimeout(() => {
        wire.connectTo(room, id, role)
      }, 0)
      return wire.client
    },
  })
}

function titleOf(held: BoardPeer): string {
  return held.store.getDocument().meta.title
}

function stickyCount(held: BoardPeer): number {
  return [...held.store.getDocument().objects.values()].filter(
    (object) => object.type === 'sticky',
  ).length
}

async function settles(): Promise<void> {
  // Two turns: the room answers on one and the session applies on the next.
  await new Promise((resolve) => setTimeout(resolve, 10))
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
