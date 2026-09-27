/**
 * How far a connector's label follows the board's zoom.
 *
 * A label is part of the drawing, so it grows and shrinks with it — but only
 * between these two, as a multiple of its size at 100%. Held at one screen
 * size it was the one thing on a board at 25% still printed full size; left
 * to follow the zoom freely it would be illegible zoomed out and a headline
 * zoomed in.
 */
export const LABEL_SCALE_MIN = 0.5
export const LABEL_SCALE_MAX = 2

/**
 * The scale to draw a label at INSIDE the world transform, which has already
 * multiplied everything by `zoom`: the clamped on-screen size divided back by
 * the zoom. A `transform: scale`, never a divided length (rule 24).
 */
export function labelScale(zoom: number): number {
  return Math.min(LABEL_SCALE_MAX, Math.max(LABEL_SCALE_MIN, zoom)) / zoom
}
