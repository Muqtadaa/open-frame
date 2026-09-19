import type { BoardId, BoardRepository } from '@openframe/core'

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

export type DeleteOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

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
    return 'The room server could not be reached, so this board was left alone.'
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
    return 'This board was shared before links had roles, so its room cannot be deleted.'
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
    return { ok: false, reason: 'The board was removed from its room but not from your list.' }
  }

  // Last, and never allowed to fail the operation: a local copy that outlives
  // the board is a stale duplicate, not lost work.
  try {
    await repository.deleteBoard(board.boardId)
  } catch {
    // Nothing to tell the person. The board is gone from everywhere that
    // anybody else could reach it.
  }
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
  forgetLocalPrefs(boardId)
  return { ok: true }
}

/**
 * Renames a board in both places it is named.
 *
 * The title in the list is a COPY — the real one lives in the document, where
 * only a browser holding the board can see it. So a rename has to say so in
 * both, and the local document is written directly rather than through the
 * dispatcher because this board is not open: there is no runtime, no undo
 * stack and no room to tell.
 */
export async function renameBoard(
  repository: BoardRepository,
  board: { readonly boardId: BoardId; readonly shared: boolean },
  title: string,
): Promise<boolean> {
  const trimmed = title.trim()
  if (trimmed.length === 0 || trimmed.length > 200) return false

  if (board.shared && !(await renameRemoteBoard(board.boardId, trimmed))) return false

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
