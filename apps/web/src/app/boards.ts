import {
  createEmptyDocument,
  systemClock,
  type BoardId,
  type BoardRepository,
  type BoardSummary,
} from '@openframe/core'

import { newLocalBoardId } from './route.js'

/**
 * The boards this browser holds, for the surface that lists them.
 *
 * Local boards are the ones that need no account and no network — PRODUCT.md's
 * fourth principle, made visible. They are listed beside boards that came from
 * a server rather than replaced by them, because "the board I was working on"
 * does not become less real for having no owner.
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
