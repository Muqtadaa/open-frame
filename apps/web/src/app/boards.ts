import {
  createEmptyDocument,
  systemClock,
  type BoardDocument,
  type BoardId,
  type BoardRepository,
  type BoardSummary,
} from '@openframe/core'

import { localOpenedAt, localPins } from './board-prefs.js'
import { isSharedBoardId } from './collab-config.js'
import type { ListedBoard, RemoteBoardService } from '../runtime/services.js'

export type { ListedBoard }
import { newLocalBoardId } from './route.js'

/**
 * The boards this browser holds, for the surface that lists them.
 *
 * There is one kind of board now: yours. Local boards still appear because
 * some were made before an account was needed and are still sitting in this
 * browser — the front door offers to move those — and because a build with no
 * identity service has no account to require and keeps making them.
 */

/** Most recently touched first: a list of boards is a list of what you were doing. */
export async function listLocalBoards(
  repository: BoardRepository,
): Promise<readonly BoardSummary[]> {
  const boards = await repository.listBoards()
  return [...boards].sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Starts a board and returns where it lives.
 *
 * Written before navigating rather than on first edit, so that the list this
 * came from is true the moment it is next rendered. A board that exists only
 * in a URL is one a reload loses.
 */
export async function createLocalBoard(
  repository: BoardRepository,
  title = 'Untitled board',
): Promise<BoardId> {
  const boardId = newLocalBoardId()
  await repository.saveBoard(createEmptyDocument(boardId, title, systemClock.now()))
  return boardId
}

/**
 * A board of this browser's own holding what another board held.
 *
 * For a board deleted out from under somebody: what is on screen is then the
 * last copy anybody has, and it is theirs to keep. A NEW id rather than the
 * old one, because the old one is being forgotten as this runs and belongs to
 * a room that will refuse it; object ids are kept, being scoped to the board.
 */
export async function keepCopy(
  repository: BoardRepository,
  document: BoardDocument,
): Promise<BoardId> {
  const boardId = newLocalBoardId()
  await repository.saveBoard({
    ...document,
    id: boardId,
    meta: { ...document.meta, title: `${document.meta.title} (copy)` },
  })
  return boardId
}

/**
 * How long ago, in the smallest number of words that is still true.
 *
 * Exact timestamps on a board list are noise: nobody reads 14:32 on a Tuesday
 * and learns anything. What they want is whether this is the thing they had
 * open this morning.
 */
export function describeWhen(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000))
  if (seconds < 90) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`
  const days = Math.round(hours / 24)
  if (days < 30) return days === 1 ? 'yesterday' : `${days} days ago`
  const months = Math.round(days / 30)
  return months === 1 ? 'last month' : `${months} months ago`
}

/**
 * Deleting removes the board from everybody; leaving removes you from it.
 *
 * Two verbs that look alike in a list and must never be one control. Only an
 * owner can delete; only somebody who is NOT the owner can leave; a local
 * board has neither, because there is nobody else involved — it is just gone.
 */
export function canDelete(board: ListedBoard): boolean {
  return !board.shared || board.role === 'owner'
}

export function canLeave(board: ListedBoard): boolean {
  return board.shared && board.role !== 'owner'
}

/**
 * Everything this person can open: pinned first, then in YOUR order.
 *
 * It used to sort on `updatedAt`, which is when a board last CHANGED. On a
 * shared board that is somebody else's typing, so a collaborator working at
 * midnight rearranged your list while you slept. "Edited 4 minutes ago" is
 * still shown, because it is worth knowing; it is just no longer what decides
 * where a row sits.
 *
 * A board that is BOTH local and shared appears once, as the shared one. This
 * is no longer how sharing behaves — it moves a board now, so there is nothing
 * left to collide with — but boards shared BEFORE that change still have their
 * originals sitting in this browser, and the fix for those must not be to show
 * each of them twice.
 */
export async function listAllBoards(
  deps: {
    readonly repository: BoardRepository
    readonly remoteBoards: Pick<RemoteBoardService, 'listMine'>
    /** Whether this build has accounts at all. */
    readonly accountsEnabled: boolean
  },
  signedIn: boolean,
): Promise<readonly ListedBoard[]> {
  const local = await listLocalBoards(deps.repository)
  /*
   * Asked for only when there is somebody to ask about. A signed-out visitor
   * making an RPC that can only ever return nothing is a round trip spent on
   * the front door of a local-first product.
   */
  const remote = signedIn && deps.accountsEnabled ? await deps.remoteBoards.listMine() : []

  const shared = new Set(remote.map((board) => board.boardId))
  // A local board keeps its preferences here, because it exists here and
  // nowhere else. A signed-in person's travel with them, in the database.
  const pins = localPins()
  const opened = localOpenedAt()

  const listed: ListedBoard[] = [
    ...remote.map((board) => ({
      boardId: board.boardId,
      title: board.title,
      updatedAt: board.updatedAt,
      shared: true,
      role: board.role,
      accessKey: board.accessKey,
      viewKey: board.viewKey,
      ownerKey: board.ownerKey,
      pinned: board.pinned,
      openedAt: board.openedAt,
      workspaceId: board.workspaceId,
    })),
    ...local
      /*
       * A board that lives in a room is never "in this browser", whatever is
       * sitting in IndexedDB under its id.
       *
       * Opening somebody's link builds a runtime for that board, and
       * `createRuntime` writes an empty document the moment it cannot find one
       * — so a link you merely LOOKED at left a row in your list called
       * "Untitled board", tagged `this browser`, pointing at a board that is
       * neither untitled nor yours. It is a cache of a room, and the room
       * decides whether you have it: if you do, the remote list above carries
       * it with its real name and its real tag.
       */
      .filter((board) => !isSharedBoardId(board.id))
      .filter((board) => !shared.has(board.id))
      .map((board) => ({
        boardId: board.id,
        title: board.title,
        updatedAt: board.updatedAt,
        shared: false,
        role: null,
        accessKey: null,
        viewKey: null,
        ownerKey: null,
        pinned: pins.has(board.id),
        // Never opened on this browser falls back to when it last changed, so
        // a board does not sink out of sight for having been made rather than
        // revisited.
        openedAt: opened[board.id] ?? board.updatedAt,
        workspaceId: null,
      })),
  ]

  return listed.sort((a, b) => {
    // Pinned first, and only then recency — a pin that lost to a fresh edit
    // would not be a pin.
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.openedAt - a.openedAt
  })
}
