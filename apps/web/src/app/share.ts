import type { BoardId } from '@openframe/core'

import type { OpenFrameRuntime } from '../runtime/context.js'
import { claimUrl, newSharedBoardId, shareLink } from './collab-config.js'
import { currentIdentity } from './identity.js'
import { recordSharedBoard } from './remote-boards.js'

/**
 * Turns the board you are looking at into one other people can open.
 *
 * It MOVES rather than copies. It used to copy, and the argument was written
 * down here: sharing should never be the act that takes your own board away
 * from you. That held while a board could belong to nobody — the local one was
 * the only thing you were certain of. Once every board has an owner and the
 * list has one kind of row, a copy is not a safety net, it is two boards with
 * the same name drifting apart, and the one you keep opening is whichever the
 * list happened to sort first.
 *
 * The ORDER is the safety argument now: the shared board is written, and only
 * then is the local one removed. Every failure path above that line leaves the
 * original exactly where it was.
 *
 * Written straight through the repository rather than replayed as commands: it
 * is not an edit to the current board, it is a board changing where it lives,
 * and the document has already been through validation on the way in.
 */

export interface SharedBoard {
  readonly boardId: BoardId
  /** Whoever holds this can change the board. */
  readonly editLink: string
  /** Whoever holds this can watch it, and be seen watching. */
  readonly viewLink: string
}

export class ShareFailed extends Error {}

/**
 * The room's two keys, asked for BEFORE the board is written into it.
 *
 * Order matters and is enforced on the server: a room may only be claimed
 * while it is empty, which is what stops anyone holding a link claiming
 * somebody else's board. Claiming first is therefore not an optimisation, it
 * is the only order that works.
 */
async function claimRoom(boardId: BoardId): Promise<{ editor: string; viewer: string }> {
  let response: Response
  try {
    response = await fetch(claimUrl(boardId), { method: 'POST' })
  } catch {
    throw new ShareFailed('The room server could not be reached.')
  }

  if (!response.ok) {
    /*
     * Deliberately fatal rather than falling back to a link without keys. A
     * silent downgrade would hand somebody an unprotected board at the moment
     * they asked for a view-only one — the failure mode where the interface
     * says a thing it is not doing.
     */
    throw new ShareFailed('This board could not be given its links.')
  }

  const keys: unknown = await response.json()
  if (
    typeof keys !== 'object' ||
    keys === null ||
    typeof (keys as { editor?: unknown }).editor !== 'string' ||
    typeof (keys as { viewer?: unknown }).viewer !== 'string'
  ) {
    throw new ShareFailed('The room server sent something this version cannot read.')
  }
  return keys as { editor: string; viewer: string }
}

export async function shareCurrentBoard(runtime: OpenFrameRuntime): Promise<SharedBoard> {
  /*
   * A board we could not fully read is never written anywhere, and this is the
   * one path where getting that wrong destroys everything: it would write a
   * partial copy and then delete the original it was made from. The button is
   * disabled for a read-only board, which is an affordance; this is the rule.
   */
  if (runtime.readOnly) {
    throw new ShareFailed('This board could not be fully read, so it cannot be shared.')
  }

  const boardId = newSharedBoardId()
  const keys = await claimRoom(boardId)

  const document = runtime.store.getDocument()
  await runtime.repository.saveBoard({ ...document, id: boardId })

  /*
   * Recorded so it appears in the owner's list, and best effort on purpose:
   * the board and both links already exist and work. A failure here costs a
   * row in a list, and refusing to share over it would trade the thing that
   * works for the thing that is convenient.
   *
   * A guest has nobody to own it, so there is nothing to record — which is the
   * product decision, not a limitation: an account is for ownership.
   */
  if ((await currentIdentity()) !== null) {
    await recordSharedBoard({
      boardId,
      title: document.meta.title,
      editorKey: keys.editor,
      viewerKey: keys.viewer,
    })
  }

  /*
   * The move, completed — and in this order for two separate reasons.
   *
   * Autosave first, because it subscribes to the command stream and writes the
   * WHOLE document under the runtime's own board id. Deleting while it is
   * still attached leaves a board that one keystroke puts straight back, which
   * is the two-rows problem wearing a disguise.
   *
   * The board on screen is now a page that no longer exists anywhere; the
   * share panel says so, and its only way forward is to open the real one.
   */
  runtime.dispose()
  await runtime.repository.deleteBoard(runtime.boardId)

  const origin = window.location.origin
  return {
    boardId,
    editLink: shareLink(boardId, origin, keys.editor),
    viewLink: shareLink(boardId, origin, keys.viewer),
  }
}
