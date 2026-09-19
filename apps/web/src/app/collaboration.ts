import { connectBoard, type BoardConnection } from '@openframe/collab'
import type { BoardId, CommandError } from '@openframe/core'

import { browserRoomSocket } from '../adapters/browser-room-socket.js'
import type { OpenFrameRuntime } from '../runtime/context.js'
import { roomSocketUrl } from './collab-config.js'
import { guestIdentity } from './guest.js'

/**
 * Puts a board in its room.
 *
 * Called only for a board opened with `?room=`, and only when this build has a
 * room server — a board with no link is local, which is PRODUCT.md's fourth
 * principle rather than a default anyone chose.
 */

/** Boards this browser has already published into. See `seed` below. */
const SEEDED_KEY = 'openframe:seeded'

function alreadySeeded(boardId: BoardId): boolean {
  try {
    const raw = localStorage.getItem(`${SEEDED_KEY}:${boardId}`)
    return raw === 'yes'
  } catch {
    // If storage cannot be read, assume it HAS been seeded. Publishing twice is
    // the harmful direction: it resurrects everything anyone else deleted.
    return true
  }
}

function markSeeded(boardId: BoardId): void {
  try {
    localStorage.setItem(`${SEEDED_KEY}:${boardId}`, 'yes')
  } catch {
    // Nothing to do; the next connection will simply not seed either.
  }
}

export function startCollaboration(
  runtime: OpenFrameRuntime,
  boardId: BoardId,
  onError: (error: CommandError) => void,
  /** Which of the board's two links this browser arrived on. */
  key: string | null = null,
): BoardConnection {
  /*
   * Seeded exactly once per browser per board: the first connection publishes
   * whatever is local, and every later one takes the room as the truth.
   *
   * The asymmetry is real and worth stating. A `Y.Doc` built fresh from
   * IndexedDB carries no deletion history, so re-publishing local state would
   * resurrect every object anyone else had deleted in the meantime. Persisting
   * the CRDT itself removes the asymmetry, and that is Stage 3.
   */
  const seed = !alreadySeeded(boardId)
  if (seed) markSeeded(boardId)

  const connection = connectBoard({
    store: runtime.store,
    dispatcher: runtime.dispatcher,
    connect: () => browserRoomSocket(roomSocketUrl(boardId, key)),
    onError,
    seed,
  })

  const guest = guestIdentity()
  connection.setPresence({ name: guest.name, hue: guest.hue })
  return connection
}
