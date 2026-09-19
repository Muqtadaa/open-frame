import type { BoardId } from '@openframe/core'

import type { OpenFrameRuntime } from '../runtime/context.js'
import { newSharedBoardId, shareLink } from './collab-config.js'

/**
 * Turns the board you are looking at into one other people can open.
 *
 * It COPIES rather than moves: the local board stays exactly as it was, and the
 * shared one starts as a duplicate under a new, unguessable id. That asymmetry
 * is deliberate — sharing should never be the act that takes your own board
 * away from you, and an id that could be guessed is the only thing standing
 * between a board and the internet until Stage 3 brings a password.
 *
 * Written straight through the repository rather than replayed as commands: it
 * is not an edit to the current board, it is a second board coming into
 * existence, and the document being copied has already been through validation
 * on the way in.
 */
export async function shareCurrentBoard(runtime: OpenFrameRuntime): Promise<{
  readonly boardId: BoardId
  readonly link: string
}> {
  const boardId = newSharedBoardId()
  const document = runtime.store.getDocument()
  await runtime.repository.saveBoard({ ...document, id: boardId })
  return { boardId, link: shareLink(boardId, window.location.origin) }
}
