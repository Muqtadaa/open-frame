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
