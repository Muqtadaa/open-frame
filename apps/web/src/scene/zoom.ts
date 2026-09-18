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
/**
 * Where Cmd/Ctrl +/- stops.
 *
 * Every stop is a percentage a person would say out loud — 25%, 50%, 100%,
 * 400% — because the readout beside the slider shows exactly this number and
 * "75%" or "300%" reads as having landed somewhere by accident. The doubling
 * above 100% and the quartering below it keep the steps even on a log scale, so
 * each press feels like the same size of move in both directions.
 *
 * 5% is included although it is not a doubling: it is `MIN_ZOOM`, and a step
 * list that cannot reach the clamp leaves the last press doing nothing.
 */
export const ZOOM_STEPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16] as const

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

/**
 * The smallest pan that brings `bounds` into view. Zoom is never touched.
 *
 * Two things produce an object the user cannot see. Synthesising an insight
 * places it above the cluster it was drawn from, which can be above the top of
 * the window; and following a provenance trail selects an object that may be
 * anywhere on the board. Both would otherwise leave the record panel describing
 * something invisible, which reads as the panel being wrong.
 *
 * Minimal rather than centred, and never re-zoomed: the user built this view,
 * and a reveal that reframed the board would lose the spatial arrangement they
 * are in the middle of thinking with. When the bounds are larger than the
 * window, the near edge wins — showing the start of something is more useful
 * than showing its middle.
 *
 * Returns the SAME viewport object when nothing needs to move, so an already
 * visible target costs no store write and no re-render.
 */
export function panToReveal(
  viewport: Viewport,
  bounds: Rect,
  screenWidth: number,
  screenHeight: number,
  paddingPx = 48,
): Viewport {
  const visibleWidth = screenWidth / viewport.zoom
  const visibleHeight = screenHeight / viewport.zoom
  const margin = paddingPx / viewport.zoom

  let { x, y } = viewport
  if (bounds.x - margin < x) x = bounds.x - margin
  else if (bounds.x + bounds.width + margin > x + visibleWidth) {
    x = bounds.x + bounds.width + margin - visibleWidth
  }
  if (bounds.y - margin < y) y = bounds.y - margin
  else if (bounds.y + bounds.height + margin > y + visibleHeight) {
    y = bounds.y + bounds.height + margin - visibleHeight
  }

  return x === viewport.x && y === viewport.y ? viewport : { ...viewport, x, y }
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
    rects.push(registry.boundsOf(object, doc))
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
