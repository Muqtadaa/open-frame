/**
 * How far from the window's left edge the tool rail reaches, plus a step of
 * air — the band no floating surface may enter.
 *
 * One number, because it was two: the record panel and the text editor's
 * chrome each kept their own copy of 84, and both went stale together the
 * moment the rail grew a strip for its tools' options. The rail is the gutter
 * (20), its left padding and border (7), a tool (50), and the options strip
 * and border (13).
 */
export const RAIL_CLEARANCE_PX = 100
