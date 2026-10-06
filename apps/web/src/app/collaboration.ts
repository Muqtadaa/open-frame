import { connectBoard, type BoardConnection } from '@openframe/collab'
import {
  allowAllCapabilities,
  CommandDispatcher,
  createDefaultRegistry,
  createDocumentStore,
  createEmptyDocument,
  createIdGenerator,
  systemClock,
  type BoardId,
  type CommandError,
} from '@openframe/core'

import { browserRoomSocket } from '../adapters/browser-room-socket.js'
import { indexedDbCrdtStore } from '../adapters/indexeddb/crdt-store.js'
import type { OpenFrameRuntime } from '../runtime/context.js'
import { heldOwnerKey, heldToken } from './board-password.js'
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
    /*
     * Read on every attempt rather than captured once: unlocking the board
     * writes the token and then reconnects, and a closure holding the value
     * from before would reconnect without it forever.
     */
    connect: () =>
      browserRoomSocket(roomSocketUrl(boardId, key, heldToken(boardId), heldOwnerKey(boardId))),
    onError,
    persistence: indexedDbCrdtStore(boardId),
    // Only a board this device really holds is offered to an empty room;
    // one it has just started blank never is.
    seed: runtime.stored,
  })

  const guest = guestIdentity()
  connection.setPresence({ name: guest.name, hue: guest.hue })
  return connection
}

/** How long a rename from the board list waits for the room before giving up. */
const RENAME_TIMEOUT_MS = 10_000

/**
 * Renames a shared board IN ITS ROOM, from somewhere the board is not open —
 * the board list.
 *
 * The name a board shows is the one in its room. The list keeps a copy, and a
 * rename from the list used to write only that copy and this browser's saved
 * board: every other device, and this one on a fresh start, went on opening
 * the board under its old name while the list showed the new one (reported by
 * the owner). So the rename joins the room the way any peer does, waits for
 * the board, and makes the same change a rename inside the board makes —
 * through a dispatcher, never by writing the CRDT (rule 3).
 *
 * `seed: false`: this joins to change one field of a board that exists, and
 * must never publish the empty document it starts from.
 */
export async function renameInRoom(
  boardId: BoardId,
  key: string | null,
  title: string,
): Promise<boolean> {
  const { store, writer } = createDocumentStore(
    createEmptyDocument(boardId, 'Untitled board', systemClock.now()),
  )
  const dispatcher = new CommandDispatcher({
    store,
    writer,
    registry: createDefaultRegistry(),
    clock: systemClock,
    ids: createIdGenerator(),
    // The room decides; a viewer's write is refused there and reported below.
    capabilities: allowAllCapabilities,
  })
  const connection = await connectBoard({
    store,
    dispatcher,
    seed: false,
    connect: () =>
      browserRoomSocket(roomSocketUrl(boardId, key, heldToken(boardId), heldOwnerKey(boardId))),
    onError: () => undefined,
    persistence: indexedDbCrdtStore(boardId),
  })
  try {
    const synced = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        resolve(false)
      }, RENAME_TIMEOUT_MS)
      connection.onSynced(() => {
        clearTimeout(timer)
        resolve(true)
      })
    })
    if (!synced || connection.role !== 'editor') return false
    return dispatcher.dispatch({ kind: 'SetBoardTitle', title }).ok
  } finally {
    // A beat for the update to leave: a socket closed in the same turn as the
    // write can drop it.
    setTimeout(() => {
      connection.destroy()
    }, 250)
  }
}

/**
 * Opens one of a room's earlier versions (ADR 0019). Here because decoding it
 * is Yjs, and this module is what a shared board already loads lazily for Yjs.
 */
export { boardFromUpdate as decodeVersion } from '@openframe/collab'
