import type { SharedBoard } from '../runtime/services.js'

/*
 * Sharing a local board MOVES it: a new board id, a page load onto it, and the
 * sheet that was showing the links is gone with the old page. So the links are
 * left in this tab's session for the board they belong to, and the sheet on the
 * other side takes them — once, so a reload does not open it again.
 */

/** Where a move leaves its links for the board it lands on. */
const HANDOVER = 'openframe:shared-links'

export function handOver(shared: SharedBoard): void {
  try {
    sessionStorage.setItem(HANDOVER, JSON.stringify(shared))
  } catch {
    // Storage refused: the board still moved, and the links are on its row.
  }
}

/** The links a move left for THIS board, taken once so a reload does not reopen them. */
export function takeHandedOver(boardId: SharedBoard['boardId']): SharedBoard | null {
  try {
    const raw = sessionStorage.getItem(HANDOVER)
    if (raw === null) return null
    const shared = JSON.parse(raw) as Partial<SharedBoard>
    if (shared.boardId !== boardId) return null
    sessionStorage.removeItem(HANDOVER)
    return typeof shared.editLink === 'string' && typeof shared.viewLink === 'string'
      ? { boardId, editLink: shared.editLink, viewLink: shared.viewLink }
      : null
  } catch {
    return null
  }
}
