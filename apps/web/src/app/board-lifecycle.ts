import type { BoardId, BoardRepository } from '@openframe/core'

import type { Outcome, RemoteBoardService, RoomService } from '../runtime/services.js'
import { adoptOwnerKey, heldOwnerKey } from './board-password.js'
import { forgetLocalPrefs } from './board-prefs.js'
import { COLLAB_ENABLED } from './collab-config.js'

/** What removing and renaming a board need from the outside world. */
export interface LifecycleDeps {
  readonly repository: BoardRepository
  readonly rooms: RoomService
  readonly remoteBoards: RemoteBoardService
  /** Drops a board's stored collaborative history from this browser. */
  readonly forgetCrdt: (boardId: BoardId) => Promise<void>
  /** Renames the board where it really lives: in its room, as a peer would. */
  readonly renameInRoom: (boardId: BoardId, key: string | null, title: string) => Promise<boolean>
}

/**
 * Removing a board, which is three removals in a row and has to be all of them.
 *
 * A board can exist in three places at once: this browser's IndexedDB, a row
 * in the database, and a Durable Object holding the collaborative document.
 * Deleting one of the three is not deleting the board — it is producing a
 * board that is gone from the list and still readable by anybody holding a
 * link, which is the worst of both.
 *
 * The ORDER is the whole design, and it is the opposite of the one sharing
 * uses. Sharing writes the new thing before removing the old, so a failure
 * leaves the original. Deleting destroys the FURTHEST thing first, so a
 * failure leaves the board listed and openable rather than orphaned: a row you
 * can still see and try again is recoverable, a room nobody can reach is not.
 */

export type DeleteOutcome = Outcome

/** What deleting a shared board needs to know about it. */
interface Deletable {
  readonly boardId: BoardId
  readonly shared: boolean
  /** The edit link: only ever used to ADOPT an owner key, never to destroy. */
  readonly accessKey: string | null
  readonly ownerKey?: string | null
}

const NOT_OWNER = 'Only this board’s owner can delete it.'

/**
 * The key a room is destroyed with: the OWNER's, and never the edit link.
 *
 * The edit link is handed to everybody invited to change the board, and the
 * room refuses it. A board claimed before owner keys existed has none, so it
 * adopts one here on its edit link — the same path setting a password takes —
 * and the key is recorded before it is used, because the room mints only once.
 */
async function ownerKeyFor(deps: LifecycleDeps, board: Deletable): Promise<string | null> {
  const known = board.ownerKey ?? heldOwnerKey(board.boardId)
  if (known !== null) return known
  if (board.accessKey === null) return null
  return adoptOwnerKey(deps, board.boardId, board.accessKey)
}

/**
 * Destroys the room, or says why it could not.
 *
 * `null` means there was nothing to destroy, which is a success: a board that
 * was never shared has no room, and a build with no room server cannot have
 * given it one.
 */
async function destroyRoom(deps: LifecycleDeps, board: Deletable): Promise<string | null> {
  if (!COLLAB_ENABLED || !board.shared || board.accessKey === null) return null

  const ownerKey = await ownerKeyFor(deps, board)
  if (ownerKey === null) return NOT_OWNER

  switch (await deps.rooms.destroy(board.boardId, ownerKey)) {
    case 'unreachable':
      return 'OpenFrame could not reach the server, so nothing was deleted.'
    // Already gone. Deleting a board twice is not an error, and refusing here
    // would strand a row whose room a previous attempt had already destroyed.
    case 'gone':
    case 'destroyed':
      return null
    /*
     * A board shared before links had roles. The room keeps no key, so there is
     * nobody it can trust to destroy it — said plainly rather than swallowed,
     * because the person is about to lose the row and should know the room
     * outlives it.
     */
    case 'legacy':
      return 'This board was shared before view-only links existed, so it cannot be deleted here.'
    // Only reachable without an owner key, which `ownerKeyFor` never allows.
    // Answered rather than retried: a loop against the destructive endpoint
    // is the last thing to discover in production.
    case 'needs-owner':
      return NOT_OWNER
    /*
     * The room could not delete every image. It is already closed to everyone,
     * and some images may be gone, so this is not "nothing happened" — but it
     * kept its keys, and the row stays here, so the same request made again
     * carries on where this one stopped.
     */
    case 'unfinished':
      return 'The board was only partly deleted. Delete again to finish.'
    case 'refused':
      return 'This board could not be deleted.'
  }
}

/**
 * Deletes a board everywhere it exists. Only its owner can.
 *
 * The room enforces that, by refusing anything but the owner key, and the
 * database does too for the row — this is an affordance, not the control. What matters here is the ORDER, which the database cannot enforce.
 */
export async function deleteBoardEverywhere(
  deps: LifecycleDeps,
  board: Deletable,
): Promise<DeleteOutcome> {
  const roomFailure = await destroyRoom(deps, board)
  if (roomFailure !== null) return { ok: false, reason: roomFailure }

  if (board.shared && !(await deps.remoteBoards.remove(board.boardId))) {
    /*
     * The room is already gone at this point, which is why this is reported
     * rather than ignored: the board is unrecoverable and its row is still
     * listed, and the person needs to know the row is the only thing left.
     */
    return {
      ok: false,
      reason: 'The board was deleted, but it could not be removed from your list.',
    }
  }

  // Last, and never allowed to fail the operation: a local copy that outlives
  // the board is a stale duplicate, not lost work.
  try {
    await deps.repository.deleteBoard(board.boardId)
  } catch {
    // Nothing to tell the person. The board is gone from everywhere that
    // anybody else could reach it.
  }
  // The CRDT too, or a deleted board leaves its whole history behind and the
  // next board to reuse the id would inherit it.
  await deps.forgetCrdt(board.boardId)
  forgetLocalPrefs(board.boardId)

  return { ok: true }
}

/** Removes YOU from somebody else's board. The board itself is untouched. */
export async function leaveBoard(deps: LifecycleDeps, boardId: BoardId): Promise<DeleteOutcome> {
  if (!(await deps.remoteBoards.leave(boardId))) {
    return { ok: false, reason: 'You could not be removed from this board.' }
  }
  try {
    await deps.repository.deleteBoard(boardId)
  } catch {
    // As above: a local copy left behind is untidy, not damaging.
  }
  await deps.forgetCrdt(boardId)
  forgetLocalPrefs(boardId)
  return { ok: true }
}

/**
 * Drops every local trace of a board the ROOM says no longer exists.
 *
 * Nothing is asked of the server: the board is already gone, and the owner who
 * deleted it is the one who told it so. What is left is this browser's copy —
 * the document, the stored CRDT and the local preferences — which would
 * otherwise stay in IndexedDB for the life of the profile, one more dead board
 * every time somebody deletes one out from under this machine.
 *
 * It is NOT what keeps the board out of the list. `listAllBoards` already
 * drops room-board ids from the "this browser" section, so the phantom row
 * cannot arrive this way — a test written to assert that it could passed with
 * this function deleted, which is the whole reason rule 23 exists.
 *
 * Every step is best effort and independent. A board that cannot be dropped
 * locally is untidy; refusing to tell the user their board is gone because the
 * tidying failed would be worse.
 */
export async function forgetDeletedBoard(
  deps: Pick<LifecycleDeps, 'repository' | 'forgetCrdt'>,
  boardId: BoardId,
): Promise<void> {
  try {
    await deps.repository.deleteBoard(boardId)
  } catch {
    // As elsewhere: a local copy left behind is untidy, not damaging.
  }
  await deps.forgetCrdt(boardId)
  forgetLocalPrefs(boardId)
}

/**
 * Renames a board everywhere it is named.
 *
 * The title in the list is a COPY — the real one lives in the document. For a
 * local board that document is this browser's, written directly because the
 * board is not open. For a SHARED board the document that counts is the one
 * in its room, and a rename that wrote only the list and this browser's copy
 * left every other device opening the board under its old name while the list
 * showed the new one (reported by the owner). So the room is renamed first,
 * the way a peer renames it, once the row has taken the name; if the room
 * cannot be reached, the row is put back and the caller says so.
 */
export async function renameBoard(
  deps: LifecycleDeps,
  board: {
    readonly boardId: BoardId
    readonly shared: boolean
    readonly accessKey?: string | null
    /** The name it has now, to put back if the room cannot take the new one. */
    readonly title?: string
  },
  title: string,
): Promise<boolean> {
  const trimmed = title.trim()
  if (trimmed.length === 0 || trimmed.length > 200) return false

  if (board.shared) {
    /*
     * The ROW first, because it is the one that can say no: the database lets
     * only the owner rename, while the room takes any editor's write. Renamed
     * in the room first, a refused row left the board renamed for everyone
     * and the list saying otherwise (Codex, on #17). And if the room then
     * cannot be reached, the row is put back, so a failure changes nothing.
     */
    if (!(await deps.remoteBoards.rename(board.boardId, trimmed))) return false
    if (!(await deps.renameInRoom(board.boardId, board.accessKey ?? null, trimmed))) {
      if (board.title !== undefined) await deps.remoteBoards.rename(board.boardId, board.title)
      return false
    }
  }

  const loaded = await deps.repository.getBoard(board.boardId)
  /*
   * A board that could not be fully read is never written back — not even to
   * change its name. Renaming a quarantined board would save a document we
   * failed to parse, which is the one unacceptable failure.
   */
  if (loaded.status === 'ok') {
    await deps.repository.saveBoard({
      ...loaded.document,
      meta: { ...loaded.document.meta, title: trimmed },
    })
  }

  return true
}
