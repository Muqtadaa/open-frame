import { connectBoard, type BoardConnection } from '@openframe/collab'
import type { BoardId, CommandError } from '@openframe/core'

import { browserRoomSocket } from '../adapters/browser-room-socket.js'
import { indexedDbCrdtStore } from '../adapters/indexeddb/crdt-store.js'
import type { OpenFrameRuntime } from '../runtime/context.js'
import { roomSocketUrl } from './collab-config.js'
import { guestIdentity } from './guest.js'

/**
 * Puts a board in its room.
 *
 * Called only for a board opened with `?room=`, and only when this build has a
 * room server. Boards made before 2026-09-19 have no room and are opened
 * without one.
 */
export async function startCollaboration(
  runtime: OpenFrameRuntime,
  boardId: BoardId,
  onError: (error: CommandError) => void,
  /** Which of the board's two links this browser arrived on. */
  key: string | null = null,
): Promise<BoardConnection> {
  /*
   * There used to be a `openframe:seeded:<board>` flag in localStorage here,
   * deciding whether to publish the local board into the room. It existed
   * because a `Y.Doc` rebuilt from nothing carries no deletion history, so
   * publishing twice would resurrect everything anyone else had deleted.
   *
   * The CRDT is stored now, so the question answers itself: a browser that has
   * never held this board's CRDT is the one that seeds it, and a browser that
   * has carries the deletion history that makes rejoining safe. A flag that
   * has to be maintained alongside the thing it describes is a second source
   * of truth, and this one was keeping a bug alive.
   */
  const connection = await connectBoard({
    store: runtime.store,
    dispatcher: runtime.dispatcher,
    connect: () => browserRoomSocket(roomSocketUrl(boardId, key)),
    onError,
    persistence: indexedDbCrdtStore(boardId),
  })

  const guest = guestIdentity()
  connection.setPresence({ name: guest.name, hue: guest.hue })
  return connection
}
