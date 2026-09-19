import type { Point, Rect } from '@openframe/core'

/**
 * Where a comment's pin belongs, and how a click becomes one.
 *
 * Pure view geometry, like everything else in `scene/`: it takes the element's
 * CURRENT bounds rather than looking one up, so it names no registry, no
 * document and no store, and a test can put the element anywhere it likes.
 *
 * The shape of the problem: a remark is about a thing, but it was stored as a
 * place. Move the thing and the remark ends up pointing at empty canvas. The
 * fix is to store where on the thing, as a proportion of its box — which rides
 * a resize as well as a move, and keeps the pin on the PART that was being
 * talked about.
 */

/** What a pin needs to know about itself. A subset, so tests need no rows. */
export interface PinnedComment {
  readonly x: number | null
  readonly y: number | null
  readonly fx: number | null
  readonly fy: number | null
}

/**
 * Where to draw the pin, or `null` for a comment that is not on the board at
 * all — a reply, which is shown under its thread and nowhere else.
 *
 * `bounds` is the element's current extent, or `null` when the comment names
 * no element or names one that has been deleted. Both of those fall back to
 * the stored coordinates, which is the whole reason they are still stored: a
 * fraction of something that is gone is not a position, and a comment
 * outliving its element is a promise this product already made.
 */
export function pinPosition(comment: PinnedComment, bounds: Rect | null): Point | null {
  if (bounds !== null && comment.fx !== null && comment.fy !== null) {
    return {
      x: bounds.x + comment.fx * bounds.width,
      y: bounds.y + comment.fy * bounds.height,
    }
  }
  if (comment.x === null || comment.y === null) return null
  return { x: comment.x, y: comment.y }
}

/**
 * The proportion of `bounds` that `at` falls on.
 *
 * Clamped, because a click is hit-tested against an element's INK and its
 * bounds are a superset — a click on a rotated shape or on a connector's line
 * can land inside the ink and outside the box the fraction is measured
 * against. An unclamped value would then be stored, refused by the database's
 * own check, and the comment lost after it was typed.
 *
 * A zero-width or zero-height element is not a degenerate case to reject: a
 * perfectly horizontal connector has exactly that, and is a thing people will
 * comment on. The middle of an axis with no extent is the only answer that
 * means anything, and it round-trips — half of nothing is nothing, so the pin
 * lands back on the line.
 */
export function pinFraction(at: Point, bounds: Rect): { fx: number; fy: number } {
  return {
    fx: bounds.width === 0 ? 0.5 : clamp01((at.x - bounds.x) / bounds.width),
    fy: bounds.height === 0 ? 0.5 : clamp01((at.y - bounds.y) / bounds.height),
  }
}

function clamp01(value: number): number {
  // A non-finite value cannot be compared into range: `Math.min(1, NaN)` is
  // NaN, and a NaN transform is one the browser drops, taking the layer with
  // it. The same reasoning presence narrowing follows.
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}
