import type { BoardId } from '@openframe/core'

import type { OpenFrameRuntime } from '../runtime/context.js'
import { claimUrl, newSharedBoardId, shareLink } from './collab-config.js'

/**
 * Turns the board you are looking at into one other people can open.
 *
 * It COPIES rather than moves: the local board stays exactly as it was, and the
 * shared one starts as a duplicate under a new, unguessable id. That asymmetry
 * is deliberate — sharing should never be the act that takes your own board
 * away from you.
 *
 * Written straight through the repository rather than replayed as commands: it
 * is not an edit to the current board, it is a second board coming into
 * existence, and the document being copied has already been through validation
 * on the way in.
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
  const boardId = newSharedBoardId()
  const keys = await claimRoom(boardId)

  const document = runtime.store.getDocument()
  await runtime.repository.saveBoard({ ...document, id: boardId })

  const origin = window.location.origin
  return {
    boardId,
    editLink: shareLink(boardId, origin, keys.editor),
    viewLink: shareLink(boardId, origin, keys.viewer),
  }
}
