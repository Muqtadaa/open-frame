import type { AnyOpenFrameObject, ObjectFrame, ObjectId, Point, Rect } from '@openframe/core'

/** Handle positions, named by compass point. */
export const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const
export type HandleId = (typeof HANDLES)[number]

export const CORNER_HANDLES: readonly HandleId[] = ['nw', 'ne', 'se', 'sw']

const MIN_SIZE = 8

const GRIPS: Record<HandleId, { readonly x: number; readonly y: number }> = {
  nw: { x: 0, y: 0 },
  n: { x: 0.5, y: 0 },
  ne: { x: 1, y: 0 },
  e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 },
  s: { x: 0.5, y: 1 },
  sw: { x: 0, y: 1 },
  w: { x: 0, y: 0.5 },
}

/** Where a handle sits, as a fraction of the bounds. Drives both drawing and maths. */
export function handleAnchor(handle: HandleId): { readonly x: number; readonly y: number } {
  return GRIPS[handle]
}

export const HANDLE_CURSORS: Record<HandleId, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

export interface ResizeOptions {
  /** Preserve the aspect ratio — corner handles, or Shift held. */
  readonly preserveAspect?: boolean
  /** Resize about the centre rather than the opposite edge — Alt held. */
  readonly fromCentre?: boolean
}

/**
 * Applies a handle drag to a bounds rectangle.
 *
 * Kept as pure geometry so the fiddly parts — dragging a handle past the
 * opposite edge, aspect locking, resizing about the centre — are tested with
 * plain numbers instead of synthesised pointer events.
 */
export function resizeBounds(
  bounds: Rect,
  handle: HandleId,
  delta: Point,
  options: ResizeOptions = {},
): Rect {
  const grip = GRIPS[handle]
  const movesX = grip.x !== 0.5
  const movesY = grip.y !== 0.5

  let dx = movesX ? delta.x : 0
  let dy = movesY ? delta.y : 0

  if (options.preserveAspect === true && movesX && movesY) {
    // Follow whichever axis the pointer committed to further, so the shape
    // tracks the cursor instead of fighting it.
    const ratio = bounds.height / Math.max(1, bounds.width)
    const signX = grip.x === 0 ? -1 : 1
    const signY = grip.y === 0 ? -1 : 1
    if (Math.abs(dx) * ratio > Math.abs(dy)) dy = dx * ratio * signX * signY
    else dx = (dy / ratio) * signX * signY
  }

  const scale = options.fromCentre === true ? 2 : 1
  let x = bounds.x
  let y = bounds.y
  let width = bounds.width
  let height = bounds.height

  if (movesX) {
    if (grip.x === 0) {
      width = bounds.width - dx * scale
      x = options.fromCentre === true ? bounds.x + dx : bounds.x + dx
    } else {
      width = bounds.width + dx * scale
      if (options.fromCentre === true) x = bounds.x - dx
    }
  }

  if (movesY) {
    if (grip.y === 0) {
      height = bounds.height - dy * scale
      y = options.fromCentre === true ? bounds.y + dy : bounds.y + dy
    } else {
      height = bounds.height + dy * scale
      if (options.fromCentre === true) y = bounds.y - dy
    }
  }

  // Dragging a handle past the opposite edge flips the rect rather than
  // collapsing it to nothing, which is what every other canvas tool does.
  if (width < 0) {
    x += width
    width = -width
  }
  if (height < 0) {
    y += height
    height = -height
  }

  return {
    x,
    y,
    width: Math.max(MIN_SIZE, width),
    height: Math.max(MIN_SIZE, height),
  }
}

/** The axis-aligned box enclosing a set of frames. */
export function framesBounds(objects: readonly AnyOpenFrameObject[]): Rect | null {
  if (objects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const object of objects) {
    minX = Math.min(minX, object.frame.x)
    minY = Math.min(minY, object.frame.y)
    maxX = Math.max(maxX, object.frame.x + object.frame.width)
    maxY = Math.max(maxY, object.frame.y + object.frame.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Maps each object's frame through the same transform that took `from` to `to`.
 *
 * This is what makes resizing a multi-selection behave like resizing one thing:
 * every member keeps its relative position and proportion within the group.
 */
export function scaleFrames(
  objects: readonly AnyOpenFrameObject[],
  from: Rect,
  to: Rect,
): { readonly id: ObjectId; readonly frame: ObjectFrame }[] {
  const scaleX = to.width / Math.max(1e-6, from.width)
  const scaleY = to.height / Math.max(1e-6, from.height)

  return objects.map((object) => ({
    id: object.id,
    frame: {
      x: to.x + (object.frame.x - from.x) * scaleX,
      y: to.y + (object.frame.y - from.y) * scaleY,
      width: Math.max(MIN_SIZE, object.frame.width * scaleX),
      height: Math.max(MIN_SIZE, object.frame.height * scaleY),
      rotation: object.frame.rotation,
    },
  }))
}

/** Angle from a centre to a point, in the same clockwise convention as `frame.rotation`. */
export function angleFrom(centre: Point, p: Point): number {
  return Math.atan2(p.y - centre.y, p.x - centre.x)
}

/** Rotation snaps to 15° while Shift is held. */
export function snapAngle(radians: number, snap: boolean): number {
  if (!snap) return radians
  const step = Math.PI / 12
  return Math.round(radians / step) * step
}
