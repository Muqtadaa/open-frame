import type { BoardRoom, RoomPeer, RoomRole, RoomSocket } from '@openframe/collab'
import { asBoardId, type BoardId } from '@openframe/core'

import { openBoard, type BoardPeer } from './board.js'
import type { BoardAccess, NewComment, SignedIn } from './supabase/account.js'

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
  options: { role?: RoomRole; boardId?: BoardId; by?: string } = {},
): Promise<BoardPeer> {
  const id = `peer-${String(++joined)}`
  const role = options.role ?? 'editor'
  return openBoard({
    boardId: options.boardId ?? TEST_BOARD,
    server: 'ws://room.test',
    ...(options.by === undefined ? {} : { by: options.by }),
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

/**
 * A signed-in account with no Supabase behind it.
 *
 * The identity half is tested against a fake client in `account.test.ts`; what
 * the tools need from it is a list of boards and somewhere for a comment to
 * go, so that is all this is.
 */
export function stubAccount(boards: readonly BoardAccess[], said: NewComment[] = []): SignedIn {
  return {
    account: { userId: 'user-1', email: 'someone@example.com', displayName: 'Someone' },
    boards: () => Promise.resolve(boards),
    board: (id: BoardId) => Promise.resolve(boards.find((board) => board.boardId === id) ?? null),
    comment: (comment: NewComment) => {
      said.push(comment)
      return Promise.resolve(`cmt_${String(said.length)}`)
    },
    close: () => undefined,
  }
}

/**
 * One valid call for every tool, by name, so a test can break each tool one
 * way at a time. Tools are strict about their arguments (tracks A-4), so a
 * single payload carrying every tool's keys is refused by all of them — it
 * used to be the way these tests were written, and it only worked because
 * unknown keys were stripped.
 */
export const VALID_CALL: Readonly<Record<string, (id: string) => Record<string, unknown>>> = {
  list_boards: () => ({}),
  get_board: () => ({ board: TEST_BOARD }),
  get_objects: () => ({ board: TEST_BOARD }),
  search_board: () => ({ board: TEST_BOARD, query: 'pricing' }),
  create_objects: () => ({ board: TEST_BOARD, objects: [{ type: 'sticky', x: 0, y: 0 }] }),
  update_object: (id) => ({ board: TEST_BOARD, id, style: { color: 'blue' } }),
  move_objects: (id) => ({ board: TEST_BOARD, moves: [{ id, x: 10, y: 10 }] }),
  delete_objects: (id) => ({ board: TEST_BOARD, ids: [id] }),
  create_connector: () => ({ board: TEST_BOARD, from: { x: 0, y: 0 }, to: { x: 100, y: 0 } }),
  create_frame: () => ({ board: TEST_BOARD, name: 'Frame', x: 0, y: 0, width: 400, height: 300 }),
  add_comment: () => ({ board: TEST_BOARD, body: 'hello' }),
  list_changes: () => ({ board: TEST_BOARD }),
  revert_change: () => ({ board: TEST_BOARD }),
  group_objects: (id) => ({ board: TEST_BOARD, ids: [id, `${id}_b`] }),
  ungroup_objects: (id) => ({ board: TEST_BOARD, ids: [id] }),
  align_objects: (id) => ({ board: TEST_BOARD, ids: [id, `${id}_b`], edge: 'left' }),
  distribute_objects: (id) => ({
    board: TEST_BOARD,
    ids: [id, `${id}_b`, `${id}_c`],
    axis: 'x',
  }),
  duplicate_objects: (id) => ({ board: TEST_BOARD, ids: [id] }),
  derive_object: (id) => ({
    board: TEST_BOARD,
    toType: 'insight',
    from: [id],
    predicate: 'cites',
    x: 0,
    y: 0,
  }),
}

export function validCall(tool: string, id = 'obj_anything'): Record<string, unknown> {
  const make = VALID_CALL[tool]
  if (make === undefined) throw new Error(`No valid call written for ${tool}`)
  return make(id)
}
