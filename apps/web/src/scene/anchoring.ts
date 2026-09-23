/**
 * Where a contextual surface goes, in screen pixels.
 *
 * ONE answer for every floating surface in the product. The record panel, a
 * table's colour bar, a code block's language menu, the colour picker and the
 * context menu were each placed by their own arithmetic, which is why they
 * behaved differently at the edges of the window and why two of them could
 * leave it entirely.
 *
 * Pure, and here rather than in a component, because placement is geometry:
 * it can be decided against numbers and checked without a browser. Everything
 * it needs is passed in — nothing here reads the DOM or the store.
 */

export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

/** Which side of the anchor the surface was actually placed on. */
export type Side = 'right' | 'left' | 'below' | 'above' | 'over'

export interface AnchorRequest {
  /** What the surface belongs to, in screen pixels. */
  readonly anchor: Rect
  /** How big the surface is. An over-estimate is safer than an under-one. */
  readonly surface: Size
  /** The window the surface must stay inside. */
  readonly within: Size
  /**
   * Sides to try, in order. The first that fits wins.
   *
   * When none fits, the surface goes on the preferred side that covers the
   * ANCHOR LEAST once clamped, rather than over it. A flyout hanging off a
   * button can sit on the button — there is nothing under it worth seeing —
   * but the record panel is anchored to a selection you are about to work on,
   * and landing on it hides the very thing it describes. That was written out
   * longhand in the panel's own arithmetic before it came here: covering a
   * neighbour is a cost of floating, covering what you have just selected is
   * not. Making it the rule for everything is what let that arithmetic go.
   */
  readonly prefer: readonly Side[]
  /** Clearance between the anchor and the surface. */
  readonly gap: number
  /** Clearance from the edge of the window. */
  readonly margin: number
  /**
   * A band on the left the surface may not enter — the tool rail's footprint.
   * A selection wide enough to push a panel off both sides used to clamp it to
   * the left margin, which parked it on top of the rail.
   */
  readonly keepClearLeft?: number | undefined
  /**
   * A rectangle the surface must not land on, when any preferred side avoids
   * it — the options panel, which is the one other thing that floats beside a
   * selection and is placed by its own arithmetic.
   *
   * A PREFERENCE, not a constraint: when every side collides, the first side
   * that fits still wins. Two surfaces overlapping is bad; a surface shoved
   * somewhere unrelated to what it acts on is worse.
   */
  readonly avoid?: Rect | null | undefined
}

export interface Placement {
  readonly x: number
  readonly y: number
  readonly side: Side
}

function clamp(value: number, low: number, high: number): number {
  // `high` can be BELOW `low` on a window smaller than the surface. Clamping
  // to the low end then is what keeps the surface's top-left on screen; the
  // other order pins it to a negative coordinate and the head of it is lost.
  return Math.min(Math.max(value, low), Math.max(low, high))
}

function fits(side: Side, request: AnchorRequest): boolean {
  const { anchor, surface, within, gap, margin } = request
  const left = request.keepClearLeft ?? 0
  switch (side) {
    case 'right':
      return anchor.x + anchor.width + gap + surface.width <= within.width - margin
    case 'left':
      return anchor.x - gap - surface.width >= Math.max(margin, left)
    case 'below':
      return anchor.y + anchor.height + gap + surface.height <= within.height - margin
    case 'above':
      return anchor.y - gap - surface.height >= margin
    case 'over':
      return true
  }
}

/** Where a given side puts the surface, before clamping. */
function positionOn(side: Side, request: AnchorRequest): { x: number; y: number } {
  const { anchor, surface, gap } = request
  const x =
    side === 'right'
      ? anchor.x + anchor.width + gap
      : side === 'left'
        ? anchor.x - gap - surface.width
        : // Aligned to the anchor's leading edge for the vertical sides, which
          // is what makes a bar read as belonging to what is under it.
          anchor.x

  const y =
    side === 'below'
      ? anchor.y + anchor.height + gap
      : side === 'above'
        ? anchor.y - gap - surface.height
        : anchor.y

  return { x, y }
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  )
}

/** How much of two rectangles is the same pixels. */
function overlapArea(a: Rect, b: Rect): number {
  const across = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const down = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  return across <= 0 || down <= 0 ? 0 : across * down
}

/**
 * The first preferred side that fits, clamped so the surface stays inside the
 * window and clear of the rail.
 *
 * Both axes are clamped on every side, not only the one the side is about: a
 * surface placed to the right still has to be pushed up when the anchor is near
 * the bottom, which is the case the record panel got right and the two bars
 * anchored inside the world could not express at all.
 */
export function placeAnchored(request: AnchorRequest): Placement {
  const { surface, within, margin } = request
  const leftBound = Math.max(margin, request.keepClearLeft ?? 0)
  const rightBound = within.width - surface.width - margin
  const topBound = margin
  const bottomBound = within.height - surface.height - margin

  const settle = (side: Side): Rect => {
    const raw = positionOn(side, request)
    return {
      x: clamp(raw.x, leftBound, rightBound),
      y: clamp(raw.y, topBound, bottomBound),
      width: surface.width,
      height: surface.height,
    }
  }

  const fitting = request.prefer.filter((candidate) => fits(candidate, request))
  /*
   * Checked AFTER clamping, because clamping is what moves a surface into
   * something else: a side that looked clear at its natural position can be
   * pushed onto the panel by the window's edge.
   */
  const avoid = request.avoid ?? null
  const clear =
    avoid === null ? undefined : fitting.find((candidate) => !overlaps(settle(candidate), avoid))

  /*
   * Nothing fits. Take the preferred side that ends up covering the anchor
   * least, rather than dropping straight onto it: on a window too small for
   * any side, "below, clamped up a bit" still shows most of what the surface
   * is about, and "over" shows none of it.
   *
   * Stable under ties, so a surface does not hop between two equally bad
   * sides as the window is dragged a pixel at a time.
   */
  const leastCovering = (): Side => {
    /*
     * `over` is the bar to beat, not the last resort. An anchor as big as the
     * window leaves every side covering it just as completely, and there the
     * honest answer is still `over` — aligned with the thing it belongs to
     * rather than pinned to an edge for no gain. A side has to do strictly
     * better to be worth the move.
     */
    let best: Side = 'over'
    let least = overlapArea(settle('over'), request.anchor)
    for (const candidate of request.prefer) {
      const area = overlapArea(settle(candidate), request.anchor)
      if (area < least) {
        least = area
        best = candidate
      }
    }
    return best
  }

  const side = clear ?? fitting[0] ?? leastCovering()

  const placed = settle(side)
  return { x: placed.x, y: placed.y, side }
}
