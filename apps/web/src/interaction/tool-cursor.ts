import type { Tool } from './interaction-store.js'

/**
 * The cursor says WHICH tool is armed, not merely that one is.
 *
 * Every placing tool painted the same `crosshair`, so the pointer answered
 * "you are about to put something down" and never "you are about to put a
 * comment down" — and a crosshair is the same plus sign whether you reached
 * for a sticky note, a table or a remark. Figma and Miro both carry the
 * tool's own mark for the same reason: the rail is at the edge of the screen
 * and the pointer is where you are looking.
 *
 * A `Record<Tool, …>` on purpose. Adding a tool is then a compile error
 * rather than a tool that silently inherits somebody else's pointer — the
 * same friction the object-type registry uses, and cheaper than a test.
 *
 * `null` means the platform's own cursor is the honest one: `select` acts on
 * what is already there rather than aiming at empty board, and `pan` has a
 * hand that every user of every map already knows.
 */
const MARK: Readonly<Record<Tool, string | null>> = {
  select: null,
  pan: null,
  sticky: '<path d="M4 4h16v10l-6 6H4z"/><path d="M20 14h-6v6"/>',
  text: '<path d="M5 6V4.5h14V6M12 4.5V20M9 20h6"/>',
  // The rail's shape icon follows the chosen variant; the cursor does not.
  // Which SHAPE is a second question, and the rail is where it is answered —
  // the pointer only has to say that a shape is what lands here.
  shape: '<rect x="4.5" y="4.5" width="15" height="15" rx="2.5"/>',
  frame: '<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>',
  connector:
    '<circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="5.5" r="2.5"/><path d="M7.6 16.4 16.4 7.6"/>',
  table:
    '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9.5h18"/><path d="M3 14.5h18"/><path d="M9.5 9.5v10"/><path d="M15.5 9.5v10"/>',
  code: '<path d="m8.5 8.5-4 3.5 4 3.5"/><path d="m15.5 8.5 4 3.5-4 3.5"/><path d="M13.5 5.5 10.5 18.5"/>',
  comment: '<path d="M20 12a7 7 0 0 1-7 7H9l-4 3v-4.2A7 7 0 0 1 4 12a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7Z"/>',
}

/**
 * Twenty-eight pixels square.
 *
 * Windows will not take a cursor above 32 and quietly falls back to the
 * keyword instead of scaling one down, which is the worst outcome: it works
 * everywhere the author tested and nowhere else.
 */
const SIZE = 28

/** Where in that square the pointer actually points. */
const HOT = 3

/**
 * Drawn TWICE, the second time over the first.
 *
 * A cursor lands on a white board, a black slip, a photograph and a code
 * block, and a single-coloured one disappears into at least one of them. The
 * pale pass underneath is a halo rather than an outline — it is the same
 * geometry, stroked fat, so the dark pass on top reads against anything.
 */
function markup(mark: string): string {
  const crosshair = '<path d="M3 0v6M0 3h6"/>'
  const glyph = `<g transform="translate(9 9) scale(0.6)">${mark}</g>`
  const body = crosshair + glyph
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(SIZE)}" height="${String(SIZE)}" viewBox="0 0 ${String(SIZE)} ${String(SIZE)}">`,
    '<g fill="none" stroke="#ffffff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">',
    body,
    '</g>',
    '<g fill="none" stroke="#16202b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">',
    body,
    '</g>',
    '</svg>',
  ].join('')
}

/**
 * The CSS `cursor` value for a tool, or `null` to leave the platform's alone.
 *
 * A KEYWORD always follows the image. A data URI cursor is refused outright
 * by some platforms and by a few corporate policies, and a declaration with
 * no fallback is then dropped entirely — leaving the arrow, which says
 * nothing about a tool being armed at all.
 */
export function cursorFor(tool: Tool): string | null {
  const mark = MARK[tool]
  if (mark === null) return null
  return `url("data:image/svg+xml,${encodeURIComponent(markup(mark))}") ${String(HOT)} ${String(HOT)}, crosshair`
}

/** Every tool, for the tests that hold this to covering all of them. */
export const TOOLS_WITH_A_MARK = Object.entries(MARK)
  .filter(([, mark]) => mark !== null)
  .map(([tool]) => tool as Tool)
