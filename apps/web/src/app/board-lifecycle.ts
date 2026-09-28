import type { BoardId, BoardRepository } from '@openframe/core'

import { forgetCrdt } from '../adapters/indexeddb/crdt-store.js'
import { forgetLocalPrefs } from './board-prefs.js'
import { COLLAB_ENABLED, destroyUrl } from './collab-config.js'
import { deleteRemoteBoard, leaveRemoteBoard, renameRemoteBoard } from './remote-boards.js'

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

export type DeleteOutcome = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/**
 * Destroys the room, or says why it could not.
 *
 * `null` means there was nothing to destroy, which is a success: a board that
 * was never shared has no room, and a build with no room server cannot have
 * given it one.
 */
async function destroyRoom(boardId: BoardId, editorKey: string | null): Promise<string | null> {
  if (!COLLAB_ENABLED || editorKey === null) return null

  let response: Response
  try {
    response = await fetch(destroyUrl(boardId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: editorKey }),
    })
  } catch {
    return 'OpenFrame could not reach the server, so nothing was deleted.'
  }

  // Already gone. Deleting a board twice is not an error, and refusing here
  // would strand a row whose room a previous attempt had already destroyed.
  if (response.status === 410) return null

  /*
   * A board shared before links had roles. The room keeps no key, so there is
   * nobody it can trust to destroy it — said plainly rather than swallowed,
   * because the person is about to lose the row and should know the room
   * outlives it.
   */
  if (response.status === 409) {
    return 'This board was shared before view-only links existed, so it cannot be deleted here.'
  }

  if (!response.ok) return 'This board could not be deleted.'
  return null
}

/**
 * Deletes a board everywhere it exists. Only its owner should reach this.
 *
 * `role` is checked by the database too — this is an affordance, not the
 * control. What matters here is the ORDER, which the database cannot enforce.
 */
export async function deleteBoardEverywhere(
  repository: BoardRepository,
  board: { readonly boardId: BoardId; readonly shared: boolean; readonly accessKey: string | null },
): Promise<DeleteOutcome> {
  const roomFailure = await destroyRoom(board.boardId, board.shared ? board.accessKey : null)
  if (roomFailure !== null) return { ok: false, reason: roomFailure }

  if (board.shared && !(await deleteRemoteBoard(board.boardId))) {
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
    await repository.deleteBoard(board.boardId)
  } catch {
    // Nothing to tell the person. The board is gone from everywhere that
    // anybody else could reach it.
  }
  // The CRDT too, or a deleted board leaves its whole history behind and the
  // next board to reuse the id would inherit it.
  await forgetCrdt(board.boardId)
  forgetLocalPrefs(board.boardId)

  return { ok: true }
}

/** Removes YOU from somebody else's board. The board itself is untouched. */
export async function leaveBoard(
  repository: BoardRepository,
  boardId: BoardId,
): Promise<DeleteOutcome> {
  if (!(await leaveRemoteBoard(boardId))) {
    return { ok: false, reason: 'You could not be removed from this board.' }
  }
  try {
    await repository.deleteBoard(boardId)
  } catch {
    // As above: a local copy left behind is untidy, not damaging.
  }
  await forgetCrdt(boardId)
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
  repository: BoardRepository,
  boardId: BoardId,
): Promise<void> {
  try {
    await repository.deleteBoard(boardId)
  } catch {
    // As elsewhere: a local copy left behind is untidy, not damaging.
  }
  await forgetCrdt(boardId)
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
  repository: BoardRepository,
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
    if (!(await renameRemoteBoard(board.boardId, trimmed))) return false
    // Loaded only when needed, like the rest of collaboration: the list must
    // not pay for Yjs to render.
    const { renameInRoom } = await import('./collaboration.js')
    if (!(await renameInRoom(board.boardId, board.accessKey ?? null, trimmed))) {
      if (board.title !== undefined) await renameRemoteBoard(board.boardId, board.title)
      return false
    }
  }

  const loaded = await repository.getBoard(board.boardId)
  /*
   * A board that could not be fully read is never written back — not even to
   * change its name. Renaming a quarantined board would save a document we
   * failed to parse, which is the one unacceptable failure.
   */
  if (loaded.status === 'ok') {
    await repository.saveBoard({
      ...loaded.document,
      meta: { ...loaded.document.meta, title: trimmed },
    })
  }

  return true
}
