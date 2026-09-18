import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampZoom,
  unionAll,
  type BoardDocument,
  type ObjectId,
  type ObjectTypeRegistry,
  type Rect,
  type Viewport,
} from '@openframe/core'

/**
 * Discrete zoom stops, so repeated keyboard zooming lands on predictable,
 * legible values instead of drifting to 37%.
 */
export const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8, 16] as const

export function nextZoomIn(zoom: number): number {
  return clampZoom(ZOOM_STEPS.find((step) => step > zoom + 1e-6) ?? MAX_ZOOM)
}

export function nextZoomOut(zoom: number): number {
  const lower = [...ZOOM_STEPS].reverse().find((step) => step < zoom - 1e-6)
  return clampZoom(lower ?? MIN_ZOOM)
}

/**
 * Maps a percentage from the zoom slider onto the zoom range logarithmically.
 *
 * A linear slider is unusable here: half its travel would sit between 8x and
 * 16x, and everything from 5% to 100% would be crammed into the first third.
 * Zoom is perceptually multiplicative, so the control has to be too.
 */
export function sliderToZoom(position: number): number {
  const t = Math.min(1, Math.max(0, position))
  return clampZoom(Math.exp(Math.log(MIN_ZOOM) + t * (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM))))
}

export function zoomToSlider(zoom: number): number {
  const clamped = clampZoom(zoom)
  return (Math.log(clamped) - Math.log(MIN_ZOOM)) / (Math.log(MAX_ZOOM) - Math.log(MIN_ZOOM))
}

/** Keeps the centre of the screen fixed while changing zoom. */
export function zoomAtCentre(
  viewport: Viewport,
  screenWidth: number,
  screenHeight: number,
  nextZoom: number,
): Viewport {
  const zoom = clampZoom(nextZoom)
  const centreX = viewport.x + screenWidth / viewport.zoom / 2
  const centreY = viewport.y + screenHeight / viewport.zoom / 2
  return { zoom, x: centreX - screenWidth / zoom / 2, y: centreY - screenHeight / zoom / 2 }
}

/** The viewport that frames `bounds` with a margin, centred. */
export function viewportForBounds(
  bounds: Rect,
  screenWidth: number,
  screenHeight: number,
  paddingPx = 64,
): Viewport {
  const availableWidth = Math.max(1, screenWidth - paddingPx * 2)
  const availableHeight = Math.max(1, screenHeight - paddingPx * 2)
  const zoom = clampZoom(
    Math.min(
      availableWidth / Math.max(1, bounds.width),
      availableHeight / Math.max(1, bounds.height),
    ),
  )
  return {
    zoom,
    x: bounds.x + bounds.width / 2 - screenWidth / zoom / 2,
    y: bounds.y + bounds.height / 2 - screenHeight / zoom / 2,
  }
}

function boundsOf(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  ids: readonly ObjectId[] | null,
): Rect | null {
  const rects: Rect[] = []
  for (const object of doc.objects.values()) {
    if (object.hidden) continue
    if (ids !== null && !ids.includes(object.id)) continue
    rects.push(registry.boundsOf(object))
  }
  return unionAll(rects)
}

/** Frames every visible object. Returns `null` for an empty board — nothing to fit. */
export function fitToDocument(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  screenWidth: number,
  screenHeight: number,
): Viewport | null {
  const bounds = boundsOf(doc, registry, null)
  return bounds === null ? null : viewportForBounds(bounds, screenWidth, screenHeight)
}

export function fitToObjects(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  ids: readonly ObjectId[],
  screenWidth: number,
  screenHeight: number,
): Viewport | null {
  if (ids.length === 0) return null
  const bounds = boundsOf(doc, registry, ids)
  return bounds === null ? null : viewportForBounds(bounds, screenWidth, screenHeight)
}
