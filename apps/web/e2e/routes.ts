/**
 * Where the suite goes to find a board.
 *
 * `/` is the front door now, not a canvas. Every spec that wants a board says
 * so here rather than eighteen times across fourteen files — which is what it
 * was, and what made adding a second surface a fourteen-file change.
 *
 * `board_local` is the id the application used for its only board before there
 * were several, so this also keeps the suite pointed at the same stored board
 * it has always used.
 */
export const BOARD_URL = '/?board=board_local'

/** The front door itself, for the specs that are about it. */
export const HOME_URL = '/'

/**
 * A local board, addressed directly, for specs that need boards in the list.
 *
 * Since 2026-09-19 starting a board takes an account, and these specs have no
 * account and no network to make one with. A local board id in the URL still
 * opens — it has to, because boards made before that change are addressed this
 * way — so this is how the suite puts rows in the ledger without pretending to
 * sign in. The board is written on its first EDIT, not on being opened: nothing
 * persists a board nobody has touched.
 */
export function localBoardUrl(name: string): string {
  return `/?board=board_${name}`
}
