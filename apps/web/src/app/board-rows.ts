import type { ListedBoard } from '../runtime/services.js'

/**
 * What a row on the board list SAYS, apart from how the list is fetched.
 *
 * These are pure, so the interface may import them directly; the fetching
 * lives in `boards.ts` and is reached only through `useServices()`.
 */

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
