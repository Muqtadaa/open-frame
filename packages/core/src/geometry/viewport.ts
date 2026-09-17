import type { Point } from './point.js'
import type { Rect } from './rect.js'

/**
 * The camera over the infinite canvas.
 *
 * `x`/`y` are the world coordinates displayed at the top-left of the screen
 * rect, and `zoom` is world-units-per-screen-pixel inverted (zoom 2 = twice
 * actual size). There is no rotation: a rotating camera would force every hit
 * test through a full matrix inverse for a feature no one has asked for.
 * If board rotation is ever needed, replace this type — that is why all
 * conversions live behind these four functions.
 */
export interface Viewport {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export const DEFAULT_VIEWPORT: Viewport = Object.freeze({ x: 0, y: 0, zoom: 1 })

export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 16

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

export function screenToWorld(viewport: Viewport, screen: Point): Point {
  return { x: screen.x / viewport.zoom + viewport.x, y: screen.y / viewport.zoom + viewport.y }
}

export function worldToScreen(viewport: Viewport, world: Point): Point {
  return { x: (world.x - viewport.x) * viewport.zoom, y: (world.y - viewport.y) * viewport.zoom }
}

/**
 * The world-space rect currently visible in a screen viewport of the given
 * size. This is the input to viewport culling — the single most important
 * performance primitive in the renderer.
 */
export function visibleWorldRect(
  viewport: Viewport,
  screenWidth: number,
  screenHeight: number,
): Rect {
  return {
    x: viewport.x,
    y: viewport.y,
    width: screenWidth / viewport.zoom,
    height: screenHeight / viewport.zoom,
  }
}

/** Zooms about a fixed screen point, so the world point under the cursor stays put. */
export function zoomAtScreenPoint(
  viewport: Viewport,
  screenAnchor: Point,
  nextZoom: number,
): Viewport {
  const zoom = clampZoom(nextZoom)
  const worldAnchor = screenToWorld(viewport, screenAnchor)
  return {
    zoom,
    x: worldAnchor.x - screenAnchor.x / zoom,
    y: worldAnchor.y - screenAnchor.y / zoom,
  }
}

export function panViewport(viewport: Viewport, screenDx: number, screenDy: number): Viewport {
  return {
    ...viewport,
    x: viewport.x - screenDx / viewport.zoom,
    y: viewport.y - screenDy / viewport.zoom,
  }
}
