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
   * Sides to try, in order. The first that fits wins; if none does, the
   * surface is placed OVER the anchor and clamped, because a surface off the
   * screen is worse than a surface in the way.
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
  readonly keepClearLeft?: number
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
  const { anchor, surface, within, gap, margin } = request
  const leftBound = Math.max(margin, request.keepClearLeft ?? 0)
  const rightBound = within.width - surface.width - margin
  const topBound = margin
  const bottomBound = within.height - surface.height - margin

  const side = request.prefer.find((candidate) => fits(candidate, request)) ?? 'over'

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

  return { x: clamp(x, leftBound, rightBound), y: clamp(y, topBound, bottomBound), side }
}
