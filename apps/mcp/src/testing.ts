import type { BoardRoom, RoomPeer, RoomRole, RoomSocket } from '@openframe/collab'
import { asBoardId, type BoardId } from '@openframe/core'

import { openBoard, type BoardPeer } from './board.js'

/**
 * A room in one process, for tests that need a real one.
 *
 * The same standing `packages/collab` takes with its own provider tests: the
 * room is the real `BoardRoom`, and the only thing standing in for a WebSocket
 * is `Wire`. What a real socket adds is covered where only it can be, in
 * `apps/web/e2e-rooms/mcp-peer.spec.ts`.
 *
 * Here rather than in one test file because three of them need it now, and
 * three transcriptions of a fake socket is three chances for one of them to be
 * subtly kinder than a real one.
 */

export const TEST_BOARD = asBoardId('brd_mcptestboard01')

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
      // On the next turn, not now: `connect()` is called during `start()`, and
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

let joined = 0

/** A peer on that room, connected the way the socket adapter would connect it. */
export async function peerOn(
  room: BoardRoom,
  options: { role?: RoomRole; boardId?: BoardId } = {},
): Promise<BoardPeer> {
  const id = `peer-${String(++joined)}`
  const role = options.role ?? 'editor'
  return openBoard({
    boardId: options.boardId ?? TEST_BOARD,
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

/** One turn for the room to answer, and one for the session to apply. */
export async function settles(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
