import type { ImageCrop } from './schema.js'

/**
 * Trimming an image by dragging one of its edges.
 *
 * In core, and pure, because the arithmetic is the whole feature: the picture
 * must not move or change size on screen while its window shrinks. Get that
 * wrong by a hair and cropping feels like a rubber sheet rather than a pair of
 * scissors — and it is the kind of wrong that is obvious in use and invisible
 * in a screenshot.
 */

/** The whole picture, which is what an uncropped image shows. */
export const FULL_CROP: ImageCrop = { x: 0, y: 0, width: 1, height: 1 }

/** Less than this of the picture left and there is nothing to aim at. */
const MIN_FRACTION = 0.02

/** A frame, in world units. Only the parts cropping touches. */
export interface CropBox {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Which edges a handle moves. `nw` moves the left and the top, and so on. */
export type CropHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

function movesLeft(handle: CropHandle): boolean {
  return handle === 'nw' || handle === 'w' || handle === 'sw'
}

function movesRight(handle: CropHandle): boolean {
  return handle === 'ne' || handle === 'e' || handle === 'se'
}

function movesTop(handle: CropHandle): boolean {
  return handle === 'nw' || handle === 'n' || handle === 'ne'
}

function movesBottom(handle: CropHandle): boolean {
  return handle === 'sw' || handle === 's' || handle === 'se'
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

export interface CropResult {
  readonly frame: CropBox
  readonly crop: ImageCrop
}

/**
 * The frame and the window after dragging `handle` by `dx`, `dy` world units.
 *
 * THE PIXELS THAT SURVIVE DO NOT MOVE. That is the property the arithmetic
 * exists for, and it comes out of one ratio: the visible fraction shrinks by
 * exactly the proportion the frame does, so whatever is still in view keeps
 * both its position and its scale.
 *
 * Trimming the left or top moves the frame's origin as well as its size,
 * because an object's position IS its top-left corner — leaving that alone
 * would slide the picture sideways as you cropped it.
 */
export function cropByHandle(
  frame: CropBox,
  crop: ImageCrop,
  handle: CropHandle,
  dx: number,
  dy: number,
): CropResult {
  if (frame.width <= 0 || frame.height <= 0) return { frame, crop }

  // How far each edge may travel before the window is too small to aim at.
  const floorX = frame.width * (MIN_FRACTION / crop.width)
  const floorY = frame.height * (MIN_FRACTION / crop.height)

  const left = movesLeft(handle) ? clamp(dx, 0, Math.max(0, frame.width - floorX)) : 0
  const right = movesRight(handle) ? clamp(-dx, 0, Math.max(0, frame.width - floorX - left)) : 0
  const top = movesTop(handle) ? clamp(dy, 0, Math.max(0, frame.height - floorY)) : 0
  const bottom = movesBottom(handle) ? clamp(-dy, 0, Math.max(0, frame.height - floorY - top)) : 0

  const width = frame.width - left - right
  const height = frame.height - top - bottom

  /*
   * The SAME ratio for the frame and the window. Everything else follows:
   * a frame at 60% of its width shows 60% of the fraction it showed, starting
   * wherever the left edge stopped.
   */
  const acrossRatio = width / frame.width
  const downRatio = height / frame.height

  return {
    frame: { x: frame.x + left, y: frame.y + top, width, height },
    crop: {
      x: crop.x + crop.width * (left / frame.width),
      y: crop.y + crop.height * (top / frame.height),
      width: crop.width * acrossRatio,
      height: crop.height * downRatio,
    },
  }
}

/**
 * The frame that would show the whole picture again at the current scale.
 *
 * Undoing a crop is not "set the window back to full" on its own: the frame
 * shrank with it, so restoring the window without growing the frame squeezes
 * the whole picture into the cropped box.
 */
export function uncrop(frame: CropBox, crop: ImageCrop): CropResult {
  return {
    frame: {
      x: frame.x - (frame.width / crop.width) * crop.x,
      y: frame.y - (frame.height / crop.height) * crop.y,
      width: frame.width / crop.width,
      height: frame.height / crop.height,
    },
    crop: FULL_CROP,
  }
}

/** Whether anything is actually trimmed, for a control that must not lie. */
export function isCropped(crop: ImageCrop | null | undefined): boolean {
  if (crop === null || crop === undefined) return false
  return crop.x > 0 || crop.y > 0 || crop.width < 1 || crop.height < 1
}
