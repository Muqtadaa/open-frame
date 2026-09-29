import {
  createEmptyDocument,
  systemClock,
  type BoardDocument,
  type BoardId,
  type BoardRepository,
} from '@openframe/core'

import type { OpenFrameRuntime } from '../runtime/context.js'
import {
  ShareFailed,
  type AccountService,
  type RemoteBoardService,
  type RoomKeys,
  type RoomService,
  type SharedBoard,
} from '../runtime/services.js'
import { newSharedBoardId, shareLink } from './collab-config.js'

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

export { ShareFailed, type SharedBoard }

/** What sharing needs from the outside world. */
export interface ShareDeps {
  readonly repository: BoardRepository
  readonly rooms: RoomService
  readonly accounts: AccountService
  readonly remoteBoards: RemoteBoardService
  /** Where this page is served from, which is what the links point at. */
  readonly origin: () => string
}

/**
 * The room's two keys, asked for BEFORE the board is written into it.
 *
 * Order matters and is enforced on the server: a room may only be claimed
 * while it is empty, which is what stops anyone holding a link claiming
 * somebody else's board. Claiming first is therefore not an optimisation, it
 * is the only order that works.
 */
async function claimRoom(rooms: RoomService, boardId: BoardId): Promise<RoomKeys> {
  const claimed = await rooms.claim(boardId)
  if (claimed.ok) return claimed.keys
  if (claimed.reason === 'unreachable') {
    throw new ShareFailed('OpenFrame could not reach the server.')
  }
  /*
   * Deliberately fatal rather than falling back to a link without keys. A
   * silent downgrade would hand somebody an unprotected board at the moment
   * they asked for a view-only one — the failure mode where the interface
   * says a thing it is not doing.
   */
  if (claimed.reason === 'refused') {
    throw new ShareFailed('This board could not be given its links.')
  }
  throw new ShareFailed('The server sent something this version of OpenFrame cannot read.')
}

/**
 * Puts a document in a room and writes it down as somebody's.
 *
 * The one implementation behind three gestures — starting a board, sharing
 * one, and moving a local board into an account — because they differ only in
 * where the document came from and what happens to the original. Three copies
 * of this would be three chances to get the order wrong, and the order is the
 * only thing standing between a failure and a lost board.
 */
async function publishToRoom(
  deps: ShareDeps,
  document: BoardDocument,
  workspaceId?: string,
): Promise<{ readonly boardId: BoardId; readonly keys: RoomKeys }> {
  const boardId = newSharedBoardId()
  // Claimed BEFORE anything is written: the server only lets an empty room be
  // claimed, which is what stops anyone holding a link claiming someone
  // else's board. This is the only order that works, not an optimisation.
  const keys = await claimRoom(deps.rooms, boardId)

  await deps.repository.saveBoard({ ...document, id: boardId })

  /*
   * Recorded so it appears in the owner's list, and best effort on purpose:
   * the board and both links already exist and work by the time this runs.
   * A failure here costs a row in a list.
   *
   * Still guarded, though every caller now requires an account: a build with
   * no identity service has nobody to record, and this is the one place that
   * would otherwise ask a client that does not exist.
   */
  if ((await deps.accounts.current()) !== null) {
    await deps.remoteBoards.recordShared({
      boardId,
      title: document.meta.title,
      editorKey: keys.editor,
      viewerKey: keys.viewer,
      ...(keys.owner === undefined ? {} : { ownerKey: keys.owner }),
      // Absent means the person's own workspace, which is what the database
      // falls back to. Naming one is how a board lands somewhere shared.
      ...(workspaceId === undefined ? {} : { workspaceId }),
    })
  }

  return { boardId, keys }
}

/**
 * Starts a board that belongs to your account from the moment it exists.
 *
 * A board is a server board now. That is what makes the list one kind of row
 * and what makes "follows you between browsers" true of the WORK rather than
 * only of the name — the document lives in the room, so opening the board on
 * another machine finds it there.
 *
 * The cost is stated rather than hidden: this needs the network. Every board
 * you already have keeps working offline, which is what principle 4 promises;
 * making a NEW one does not, because there is nowhere yet for it to be.
 */
export async function createOwnedBoard(
  deps: ShareDeps,
  title = 'Untitled board',
  workspaceId?: string,
): Promise<SharedBoard> {
  const document = createEmptyDocument(newSharedBoardId(), title, systemClock.now())
  const { boardId, keys } = await publishToRoom(deps, document, workspaceId)

  const origin = deps.origin()
  return {
    boardId,
    editLink: shareLink(boardId, origin, keys.editor),
    viewLink: shareLink(boardId, origin, keys.viewer),
  }
}

/**
 * Moves a board that lives only in this browser into your account.
 *
 * Offered once, on first sign-in, never taken silently — uploading somebody's
 * work to a server without asking is not a migration, it is a surprise. Same
 * order as sharing: written into the room first, original removed only after.
 */
export async function claimLocalBoard(deps: ShareDeps, boardId: BoardId): Promise<BoardId> {
  const loaded = await deps.repository.getBoard(boardId)
  /*
   * A board that could not be fully read is never written anywhere, and this
   * path would write a partial copy and then delete the original it came
   * from. It stays local, unreadable and intact.
   */
  if (loaded.status !== 'ok') throw new ShareFailed('This board could not be read.')

  const published = await publishToRoom(deps, loaded.document)
  await deps.repository.deleteBoard(boardId)
  return published.boardId
}

export async function shareCurrentBoard(
  deps: ShareDeps,
  runtime: OpenFrameRuntime,
): Promise<SharedBoard> {
  /*
   * A board we could not fully read is never written anywhere, and this is the
   * one path where getting that wrong destroys everything: it would write a
   * partial copy and then delete the original it was made from. The button is
   * disabled for a read-only board, which is an affordance; this is the rule.
   */
  if (runtime.readOnly) {
    throw new ShareFailed('This board could not be fully read, so it cannot be shared.')
  }

  /*
   * Sharing takes an account, exactly as creating does.
   *
   * A guest sharing a board produced one nobody owned: no row to list it from,
   * no way to rename or delete it, and a local cache the board list could not
   * tell apart from the cache of somebody else's link. It was a board you
   * could make and then have no handle on, which is the same failure that
   * retired the ownerless board in the first place.
   *
   * Checked here rather than only in the interface, because this is the rule.
   */
  if (deps.accounts.enabled && (await deps.accounts.current()) === null) {
    throw new ShareFailed('Sign in to share a board.')
  }

  // The board's own repository, which is the one that holds it.
  const { boardId, keys } = await publishToRoom(
    { ...deps, repository: runtime.repository },
    runtime.store.getDocument(),
  )

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

  const origin = deps.origin()
  return {
    boardId,
    editLink: shareLink(boardId, origin, keys.editor),
    viewLink: shareLink(boardId, origin, keys.viewer),
  }
}
