import { ELLIPSE, shapePath } from '../scene/shape-geometry.js'
import type { ShapeKind } from '@openframe/core'
import type { Tool } from './interaction-store.js'

/**
 * The cursor says WHICH tool is armed, not merely that one is.
 *
 * Every placing tool painted the same `crosshair`, so the pointer answered
 * "you are about to put something down" and never "you are about to put a
 * comment down". Figma and Miro both carry the tool's own mark for the same
 * reason: the rail is at the edge of the screen and the pointer is where you
 * are looking.
 *
 * ## Filled, not drawn
 *
 * The first version used the rail's line art, and at cursor size it read as
 * low-resolution — which it was. A cursor is rasterised once at a fixed pixel
 * size, and a 1.7px stroke lands between pixels on every curve; there is no
 * hinting and no second chance. Solid shapes have edges the rasteriser can
 * actually put somewhere, so the same glyph filled is markedly crisper at the
 * same size.
 *
 * A mark is therefore a SILHOUETTE plus, optionally, detail knocked back out
 * of it in the halo colour — which is how a table gets its grid lines and a
 * sticky note gets its folded corner without a third pass or a third colour.
 */
interface Mark {
  /** Shapes to fill. The glyph itself. */
  readonly body: string
  /** Drawn over the body in the halo colour: the lines inside the glyph. */
  readonly detail?: string
}

/**
 * A `Record<Tool, …>` on purpose. Adding a tool is then a compile error
 * rather than a tool that silently inherits somebody else's pointer — the
 * same friction the object-type registry uses, and cheaper than a test.
 *
 * `null` means the platform's own cursor is the honest one: `select` acts on
 * what is already there rather than aiming at empty board, and `pan` has a
 * hand that every user of every map already knows.
 *
 * `shape` is the one that cannot be a constant, because the rail's icon
 * follows the chosen variant and so should the pointer — see `shapeMark`.
 */
const MARK: Readonly<Record<Tool, Mark | null>> = {
  select: null,
  pan: null,
  sticky: {
    body: 'M4.5 4h15v9.6L13.6 20H4.5z',
    detail: 'M19.5 13.6h-5.9v6.4',
  },
  text: { body: 'M4.6 4h14.8v3.3h-5.8V20h-3.2V7.3H4.6z' },
  // Replaced per call. A rectangle is the default variant and the honest
  // stand-in for a tool that has not been asked which shape it is drawing.
  shape: { body: '' },
  frame: {
    body: 'M6.3 3h2.1v18H6.3zM15.6 3h2.1v18h-2.1zM3 6.3h18v2.1H3zM3 15.6h18v2.1H3z',
  },
  connector: {
    body:
      'M5.5 15.4a3.1 3.1 0 1 1 0 6.2 3.1 3.1 0 0 1 0-6.2zM18.5 2.4a3.1 3.1 0 1 1 0 6.2 3.1 3.1 0 0 1 0-6.2zM6.8 15.6 15.6 6.8l1.6 1.6-8.8 8.8z',
  },
  table: {
    body: 'M5.5 4.5h13a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17V7a2.5 2.5 0 0 1 2.5-2.5z',
    detail: 'M3 9.6h18M3 14.4h18M9.6 9.6v9.9M15.4 9.6v9.9',
  },
  code: {
    body: 'M5.5 4.5h13a2.5 2.5 0 0 1 2.5 2.5v10a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17V7a2.5 2.5 0 0 1 2.5-2.5z',
    detail: 'm9.6 9.3-2.9 2.7 2.9 2.7M14.4 9.3l2.9 2.7-2.9 2.7',
  },
  comment: {
    body: 'M20 12a7 7 0 0 1-7 7H9l-4 3v-4.2A7 7 0 0 1 4 12a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7Z',
  },
}

/**
 * The shape tool's mark, which follows the variant the rail is showing.
 *
 * Drawn from `shapePath`, the same geometry the object itself is drawn from,
 * so a new shape kind arrives with a cursor rather than needing one. That
 * geometry is on a 0–100 grid, hence the scale back onto the 24 the other
 * marks use.
 */
function shapeMark(kind: ShapeKind): Mark {
  const path = shapePath(kind)
  const inner =
    path === null
      ? `<ellipse cx="${String(ELLIPSE.cx)}" cy="${String(ELLIPSE.cy)}" rx="${String(ELLIPSE.rx)}" ry="${String(ELLIPSE.ry)}"/>`
      : `<path d="${path}"/>`
  // Onto the same ink box as every other mark: the geometry is a 0-100 grid
  // and the marks are drawn in 3..21 of a 24 one.
  return { body: `<g transform="translate(3 3) scale(0.18)">${inner}</g>` }
}

/**
 * Forty-four pixels square.
 *
 * It was 32, on the belief that Windows refuses anything larger. That is true
 * of an OS cursor RESOURCE and not of one a browser paints itself: Blink and
 * Gecko both cap a custom cursor at 128 square and ignore it above that, so
 * 32 was leaving most of the room on the table and the glyph read as small.
 *
 * Well under that cap rather than near it, because a cursor that is silently
 * ignored is the worst failure available here — it leaves the plain arrow,
 * which says nothing about a tool being armed at all.
 */
const SIZE = 60

/**
 * The rim is stroked OUTSIDE the path it follows, half of it either side.
 *
 * Which is what cut the corner off the crosshair: its arms were drawn from
 * zero, so the halo along the top and the left had nowhere to go and the
 * browser clipped it flat. Every measurement below leaves this much clear of
 * the edge.
 */
const RIM = 3.4

/** How far the crosshair reaches from its centre, in each of four directions. */
const ARM = 6

/**
 * Where in that square the pointer actually points, and the centre of the
 * crosshair — the same number, which is the whole of what a hotspot means.
 * Far enough in that the arm and its rim both fit.
 */
const HOT = 9

/**
 * The marks are drawn on a 24 grid with their ink inside this box.
 *
 * 22 rather than 21 because of the comment bubble's tail, which is the lowest
 * point any mark reaches. It was declared as 21 and the fit below therefore
 * understated the glyph by a whole unit — it passed, and the tail came out
 * flush against the bottom edge with a third of a pixel to spare. A box that
 * is not the real extent is a measurement that happens to be close enough.
 */
const INK_FROM = 3
const INK_TO = 22

/** Where the glyph starts, clear of the crosshair, and how big it is drawn. */
const PLACE = 18
const SCALE = 2

/**
 * The numbers, for the test that holds them to fitting.
 *
 * A cursor is clipped to its own box with no warning — the corner simply is
 * not there — and nothing about a translate, a scale and half a stroke says
 * whether they add up. This was got wrong twice: once by growing the glyph
 * past the edge, and once by drawing the crosshair hard against it.
 */
export const CURSOR_GEOMETRY = {
  size: SIZE,
  rim: RIM,
  arm: ARM,
  hot: HOT,
  place: PLACE,
  scale: SCALE,
  ink: INK_TO - INK_FROM,
} as const

export interface CursorInk {
  /** The glyph. */
  readonly ink: string
  /** The rim around it, and the lines knocked back out of it. */
  readonly halo: string
}

/**
 * Only a fallback, for a context with no stylesheet to ask — a test
 * environment, or the first paint before the theme is applied. The real
 * values come from the board's own `--of-ink` and `--of-panel`, so the cursor
 * is literally the ink of whichever world is being drawn in rather than a
 * second copy of the palette that goes stale when one changes.
 */
export const DEFAULT_INK: CursorInk = { ink: '#16202b', halo: '#ffffff' }

/**
 * The glyph is the theme's ink and the rim is the theme's paper, so a dark
 * world gets a pale cursor outlined in dark and a light one the reverse. The
 * rim is what makes either legible over a photograph or a black slip, which
 * no single colour manages on its own.
 */
function markup(mark: Mark, { ink, halo }: CursorInk): string {
  /*
   * SYMMETRIC about the hotspot, and heavier than a hairline.
   *
   * It was neither. The arms ran from zero to thirteen with the hotspot at
   * five, so it reached further down and right than up and left — and the rim
   * on the two short sides was cut off by the edge of the image, which is
   * what made it look broken rather than merely lopsided.
   *
   * Beside a filled glyph a thin cross also reads as a different cursor that
   * happens to be nearby, rather than as the point of this one.
   */
  const bar = 1.2
  const crosshair =
    `<path d="M${String(HOT - bar)} ${String(HOT - ARM)}h${String(bar * 2)}v${String(ARM * 2)}h-${String(bar * 2)}z` +
    `M${String(HOT - ARM)} ${String(HOT - bar)}h${String(ARM * 2)}v${String(bar * 2)}h-${String(ARM * 2)}z"/>`

  /*
   * Close to the crosshair, not merely inside the box. Set by arithmetic
   * alone the glyph sat in the lower-right corner with a wide empty diagonal
   * between it and the mark doing the aiming, and the cursor read as small
   * even as the box grew. The inner translate takes the marks' own padding
   * off, so the scale is spent on ink rather than on margin.
   */
  const place = `translate(${String(PLACE)} ${String(PLACE)}) scale(${String(SCALE)}) translate(-${String(INK_FROM)} -${String(INK_FROM)})`

  /*
   * A stroke inside a scaled group is scaled WITH it, so the glyph's rim came
   * out twice the crosshair's and the two halves of one cursor were outlined
   * differently. Every width below is divided back out, so what is written is
   * what is rendered.
   */
  const rimmed = (transform: string | null, width: number, body: string): string =>
    `<g${transform === null ? '' : ` transform="${transform}"`} fill="${halo}" stroke="${halo}" ` +
    `stroke-width="${String(width)}" stroke-linejoin="round">${body}</g>`

  const filled = (transform: string | null, body: string): string =>
    `<g${transform === null ? '' : ` transform="${transform}"`} fill="${ink}">${body}</g>`

  const glyph = shapes(mark.body)

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(SIZE)}" height="${String(SIZE)}" viewBox="0 0 ${String(SIZE)} ${String(SIZE)}">`,
    // Every rim first, so one half's halo never paints over the other's ink.
    rimmed(null, RIM, crosshair),
    rimmed(place, RIM / SCALE, glyph),
    filled(null, crosshair),
    filled(place, glyph),
    mark.detail === undefined
      ? ''
      : `<g transform="${place}" fill="none" stroke="${halo}" stroke-width="${String(1.5 / SCALE)}" stroke-linecap="round">` +
        `<path d="${mark.detail}"/></g>`,
    '</svg>',
  ].join('')
}

/** A mark's body is either raw markup already, or one path's `d`. */
function shapes(body: string): string {
  return body.startsWith('<') ? body : `<path d="${body}"/>`
}

/**
 * The CSS `cursor` value for a tool, or `null` to leave the platform's alone.
 *
 * A KEYWORD always follows the image. A data URI cursor is refused outright
 * by some platforms and by a few corporate policies, and a declaration with
 * no fallback is then dropped entirely — leaving the arrow, which says
 * nothing about a tool being armed at all.
 */
export function cursorFor(
  tool: Tool,
  shapeKind: ShapeKind = 'rectangle',
  colours: CursorInk = DEFAULT_INK,
): string | null {
  const mark = tool === 'shape' ? shapeMark(shapeKind) : MARK[tool]
  if (mark === null) return null
  return `url("data:image/svg+xml,${encodeURIComponent(markup(mark, colours))}") ${String(HOT)} ${String(HOT)}, crosshair`
}
