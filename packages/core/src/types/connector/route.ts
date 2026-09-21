import type { Point } from '../../geometry/point.js'
import type { Bend, Routing } from './schema.js'

/**
 * The shape a connector actually takes between its two ends.
 *
 * IN CORE, and not in the renderer, because four things need the same answer
 * and three of them are not drawing: the bounds culling asks for, the hit test
 * that decides whether a click landed on the line, the handle you drag to bend
 * it, and the `d` attribute. When the route lived only in the view, the other
 * three used the straight line between the endpoints instead — so clicking the
 * drawn corner of an orthogonal connector selected nothing, because the corner
 * is nowhere near the diagonal.
 */

/** The bend every connector starts with: the middle, and no offset. */
export const NO_BEND: Bend = { along: 0.5, across: 0 }

/**
 * A resolved route: straight segments, or one cubic.
 *
 * Two shapes rather than one, because flattening a curve to segments loses the
 * thing that makes it a curve and a polyline cannot describe one. Consumers
 * that need points ask `flattenRoute`; the renderer asks for neither and reads
 * the shape directly.
 */
export type Route =
  | { readonly kind: 'polyline'; readonly points: readonly Point[] }
  | { readonly kind: 'cubic'; readonly points: readonly [Point, Point, Point, Point] }

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Whether the run is more across than down, which decides the elbow's axis. */
function isHorizontal(start: Point, end: Point): boolean {
  return Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
}

/** The straight line's midpoint, which is where every route's middle starts. */
function middle(start: Point, end: Point): Point {
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
}

/**
 * Where the bend HANDLE sits, which is the middle of the drawn route.
 *
 * With no bend this is the straight midpoint for all three routings, and that
 * is not a coincidence worth relying on blindly — it is worked out for each:
 * an orthogonal route's middle segment is centred on it by construction, and
 * the default curve's control points are placed so its own midpoint lands
 * there too. A handle that started anywhere else would jump on first touch.
 */
export function bendAnchor(
  start: Point,
  end: Point,
  routing: Routing,
  bend: Bend | null,
): Point {
  const mid = middle(start, end)
  if (bend === null) return mid

  if (routing === 'orthogonal') {
    /*
     * ONE axis. An orthogonal route's middle segment is perpendicular to the
     * run, so sliding it is a one-dimensional move — dragging along the
     * segment's own direction has nothing to change. Same as every diagramming
     * tool: you push the elbow across, not up and down.
     */
    return isHorizontal(start, end)
      ? { x: lerp(start.x, end.x, bend.along), y: mid.y }
      : { x: mid.x, y: lerp(start.y, end.y, bend.along) }
  }

  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return mid

  // Unit vector along the run, and its left-hand normal.
  const ux = dx / length
  const uy = dy / length
  return {
    x: start.x + ux * length * bend.along - uy * bend.across,
    y: start.y + uy * length * bend.along + ux * bend.across,
  }
}

/**
 * The bend a handle dropped HERE describes — the inverse of `bendAnchor`.
 *
 * Inverting rather than storing the point is what makes the bend survive the
 * objects moving: a fraction and an offset still mean something after both
 * ends have gone somewhere else, and a point does not.
 */
export function bendFrom(start: Point, end: Point, routing: Routing, at: Point): Bend {
  if (routing === 'orthogonal') {
    const horizontal = isHorizontal(start, end)
    const span = horizontal ? end.x - start.x : end.y - start.y
    // A run with no span on its dominant axis is two ends in the same place;
    // there is no fraction to take, and the middle is as good as anywhere.
    if (span === 0) return NO_BEND
    const from = horizontal ? at.x - start.x : at.y - start.y
    return { along: from / span, across: 0 }
  }

  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return NO_BEND

  const ux = dx / length
  const uy = dy / length
  const px = at.x - start.x
  const py = at.y - start.y
  return {
    along: (px * ux + py * uy) / length,
    across: -px * uy + py * ux,
  }
}

/** The route, as the renderer and everything else sees it. */
export function connectorRoute(
  start: Point,
  end: Point,
  routing: Routing,
  bend: Bend | null,
): Route {
  switch (routing) {
    case 'straight':
      return { kind: 'polyline', points: [start, end] }

    case 'orthogonal': {
      /*
       * Turn on the dominant axis first, which reads as a deliberate route
       * rather than a diagonal approximated with steps. The turn is at the
       * halfway point unless a bend says otherwise.
       */
      const at = bend?.along ?? 0.5
      if (isHorizontal(start, end)) {
        const x = lerp(start.x, end.x, at)
        return { kind: 'polyline', points: [start, { x, y: start.y }, { x, y: end.y }, end] }
      }
      const y = lerp(start.y, end.y, at)
      return { kind: 'polyline', points: [start, { x: start.x, y }, { x: end.x, y }, end] }
    }

    case 'curved': {
      // Control points offset along the dominant axis give a smooth S-curve
      // that leaves and arrives roughly perpendicular to the nearest edge.
      const dx = (end.x - start.x) * 0.5
      const dy = (end.y - start.y) * 0.5
      const horizontal = isHorizontal(start, end)
      const c1 = horizontal ? { x: start.x + dx, y: start.y } : { x: start.x, y: start.y + dy }
      const c2 = horizontal ? { x: end.x - dx, y: end.y } : { x: end.x, y: end.y - dy }
      if (bend === null) return { kind: 'cubic', points: [start, c1, c2, end] }

      /*
       * BOTH control points move together, by the amount that puts the curve's
       * own midpoint exactly under the handle.
       *
       * A cubic at t=0.5 is (P0 + 3C1 + 3C2 + P3) / 8, so shifting both
       * controls by δ moves that point by ¾δ — hence the division. Solving for
       * a single control point instead would put the curve through the handle
       * too, and would flatten the default S into a symmetric arc the moment
       * you touched it.
       */
      const target = bendAnchor(start, end, routing, bend)
      const mid = middle(start, end)
      const shiftX = (target.x - mid.x) / 0.75
      const shiftY = (target.y - mid.y) / 0.75
      return {
        kind: 'cubic',
        points: [
          start,
          { x: c1.x + shiftX, y: c1.y + shiftY },
          { x: c2.x + shiftX, y: c2.y + shiftY },
          end,
        ],
      }
    }
  }
}

/**
 * Points that CONTAIN the route, for bounds.
 *
 * A cubic never leaves the convex hull of its four control points, so those
 * are a correct superset without evaluating anything. Bounds are allowed to be
 * a superset — rule 16 says so, which is why hit testing asks a second time.
 */
export function routeVertices(route: Route): readonly Point[] {
  return route.points
}

/**
 * The route as straight segments, for measuring distance to it.
 *
 * A curve is sampled, because "how far is this click from the line" has no
 * closed form for a cubic worth writing. Sixteen steps puts the error well
 * inside the padding the hit test allows.
 */
export function flattenRoute(route: Route, steps = 16): readonly Point[] {
  if (route.kind === 'polyline') return route.points

  const [p0, c1, c2, p3] = route.points
  const points: Point[] = []
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const d = t * t * t
    points.push({
      x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
      y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
    })
  }
  return points
}
