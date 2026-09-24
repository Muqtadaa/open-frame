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
 * Which way the route leaves each end, when that end is attached to something.
 *
 * Both optional, because both can be free: a half-drawn connector has no
 * attachment at all, and a route given neither behaves exactly as it did
 * before these existed. `resolveEndpoints` is where they come from.
 */
export interface RouteNormals {
  readonly start: Point | null
  readonly end: Point | null
}

/**
 * How far an orthogonal route runs straight out of an edge before it turns.
 *
 * Without it "leaves along the normal" is only true when the geometry happens
 * to agree: a line leaving a right edge towards something on the left would
 * turn immediately and run back across the object it just left. The stub makes
 * the departure real, and is why an orthogonal route now has up to two more
 * corners than it used to.
 *
 * Sixteen world units: long enough to read as a departure at the zooms
 * anybody works at, short enough not to read as a leg of the route.
 */
const STUB = 16

/** How far a curve's control points may reach, at the two extremes. */
const MIN_REACH = 12
const MAX_REACH = 160

function along(point: Point, normal: Point | null, distance: number): Point {
  if (normal === null) return point
  return { x: point.x + normal.x * distance, y: point.y + normal.y * distance }
}

/**
 * The stubbed ends an orthogonal route actually turns between.
 *
 * An end with no normal keeps its own position, so a free end and an attached
 * one can be mixed without special-casing either.
 */
function stubs(start: Point, end: Point, normals: RouteNormals | null): [Point, Point] {
  return [
    along(start, normals?.start ?? null, STUB),
    along(end, normals?.end ?? null, STUB),
  ]
}

/**
 * How far a curve's control points reach, which has to scale with the run.
 *
 * A fixed reach loops on a short connector and barely bends a long one. This
 * is the same fraction of the distance the old dominant-axis offset used, with
 * a floor so two touching objects still get a curve and a ceiling so a line
 * across the board does not bow into the next county.
 */
function reachFor(start: Point, end: Point): number {
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  return Math.max(MIN_REACH, Math.min(distance * 0.4, MAX_REACH))
}

/** The four points of the untouched curve, before any bend is applied. */
function defaultCubic(
  start: Point,
  end: Point,
  normals: RouteNormals | null,
): [Point, Point, Point, Point] {
  /*
   * With a normal the control point goes straight out of the edge; without
   * one it falls back to the offset along the run's dominant axis, which is
   * what every curve did before ends knew which way they faced.
   */
  const reach = reachFor(start, end)
  const from = normals?.start ?? null
  const to = normals?.end ?? null
  const dx = (end.x - start.x) * 0.5
  const dy = (end.y - start.y) * 0.5
  const horizontal = isHorizontal(start, end)
  const c1 =
    from !== null
      ? along(start, from, reach)
      : horizontal
        ? { x: start.x + dx, y: start.y }
        : { x: start.x, y: start.y + dy }
  const c2 =
    to !== null
      ? along(end, to, reach)
      : horizontal
        ? { x: end.x - dx, y: end.y }
        : { x: end.x, y: end.y - dy }
  return [start, c1, c2, end]
}

/** A cubic at t = 0.5, which is where its own middle is. */
function cubicMiddle([p0, c1, c2, p3]: readonly [Point, Point, Point, Point]): Point {
  return {
    x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8,
    y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8,
  }
}

/**
 * Drops points a route passes through twice.
 *
 * A stub can land exactly on the corner that follows it, and a zero-length
 * segment has no direction — which matters because the arrowheads are
 * oriented by the first and last segments. A cap with no segment to sit on
 * points wherever the arithmetic happened to land.
 */
function withoutRepeats(points: readonly Point[]): Point[] {
  const kept: Point[] = []
  for (const point of points) {
    const last = kept[kept.length - 1]
    if (last?.x === point.x && last.y === point.y) continue
    kept.push(point)
  }
  return kept
}

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
  normals: RouteNormals | null = null,
): Point {
  if (routing === 'orthogonal') {
    /*
     * Between the STUBS, not between the ends: the middle segment of an
     * orthogonal route now starts where the departure finishes. Measuring
     * against the ends instead would put the handle a stub's length off the
     * line it is supposed to be on.
     */
    const [s, e] = stubs(start, end, normals)
    const mid = middle(s, e)
    if (bend === null) return mid
    /*
     * ONE axis. An orthogonal route's middle segment is perpendicular to the
     * run, so sliding it is a one-dimensional move — dragging along the
     * segment's own direction has nothing to change. Same as every diagramming
     * tool: you push the elbow across, not up and down.
     */
    return isHorizontal(s, e)
      ? { x: lerp(s.x, e.x, bend.along), y: mid.y }
      : { x: mid.x, y: lerp(s.y, e.y, bend.along) }
  }

  /*
   * The middle of the DRAWN route, which for a curve is its own midpoint and
   * no longer the midpoint of the straight line: control points that leave
   * along an edge's normal put the curve somewhere else entirely. A handle
   * that started anywhere but on the line jumps the moment it is touched.
   */
  const base =
    routing === 'curved' ? cubicMiddle(defaultCubic(start, end, normals)) : middle(start, end)
  if (bend === null) return base

  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return base

  // Unit vector along the run, and its left-hand normal. `along` is measured
  // from the middle, so an untouched bend leaves the handle exactly on `base`.
  const ux = dx / length
  const uy = dy / length
  const slide = length * (bend.along - 0.5)
  return {
    x: base.x + ux * slide - uy * bend.across,
    y: base.y + uy * slide + ux * bend.across,
  }
}

/**
 * The bend a handle dropped HERE describes — the inverse of `bendAnchor`.
 *
 * Inverting rather than storing the point is what makes the bend survive the
 * objects moving: a fraction and an offset still mean something after both
 * ends have gone somewhere else, and a point does not.
 */
export function bendFrom(
  start: Point,
  end: Point,
  routing: Routing,
  at: Point,
  normals: RouteNormals | null = null,
  /**
   * How close, in world units, an elbow has to come to collapse the route to
   * a single corner. Zero never snaps.
   *
   * An orthogonal route turns twice: out of one end, across, and into the
   * other. Pushed all the way to either end it becomes an L, which is the
   * shape people actually draw — so the drag finds it rather than requiring
   * the elbow to be landed on an exact pixel. The caller decides HOW close by
   * what it passes, which is how the snap can be stickier once it has taken
   * (a wider number to release than to catch) without this having to remember
   * anything between one pointer event and the next.
   */
  snapWithin = 0,
): Bend {
  if (routing === 'orthogonal') {
    const [s, e] = stubs(start, end, normals)
    const horizontal = isHorizontal(s, e)
    const span = horizontal ? e.x - s.x : e.y - s.y
    // A run with no span on its dominant axis is two ends in the same place;
    // there is no fraction to take, and the middle is as good as anywhere.
    if (span === 0) return NO_BEND
    const from = horizontal ? at.x - s.x : at.y - s.y
    const along = from / span
    /*
     * The two L's: the elbow standing at one end of the run or the other.
     * Measured in world units along that run rather than as a fraction of it,
     * or a long connector would snap from half a screen away and a short one
     * would never snap at all.
     */
    if (snapWithin > 0) {
      const reach = Math.abs(snapWithin / span)
      if (along < reach) return { along: 0, across: 0 }
      if (along > 1 - reach) return { along: 1, across: 0 }
    }
    return { along, across: 0 }
  }

  const base =
    routing === 'curved' ? cubicMiddle(defaultCubic(start, end, normals)) : middle(start, end)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return NO_BEND

  const ux = dx / length
  const uy = dy / length
  const px = at.x - base.x
  const py = at.y - base.y
  return {
    along: 0.5 + (px * ux + py * uy) / length,
    across: -px * uy + py * ux,
  }
}

/** The route, as the renderer and everything else sees it. */
export function connectorRoute(
  start: Point,
  end: Point,
  routing: Routing,
  bend: Bend | null,
  normals: RouteNormals | null = null,
): Route {
  switch (routing) {
    case 'straight':
      /*
       * A straight line is a straight line. It cannot leave along a normal
       * and still arrive where it is going, and pretending otherwise would
       * make the one routing that promises nothing the one that lies.
       */
      return { kind: 'polyline', points: [start, end] }

    case 'orthogonal': {
      /*
       * OUT of each edge first, then turn. The run between the two stubs
       * turns on its own dominant axis, which reads as a deliberate route
       * rather than a diagonal approximated with steps; the turn is at the
       * halfway point unless a bend says otherwise.
       *
       * Without the stubs a line leaving a right edge towards something on
       * the left turned immediately and ran back over the object it had just
       * left — which is the same fault as an arrowhead pointing along an
       * object rather than into it, in a different routing.
       */
      const [s, e] = stubs(start, end, normals)
      const at = bend?.along ?? 0.5
      const turn = isHorizontal(s, e)
        ? [{ x: lerp(s.x, e.x, at), y: s.y }, { x: lerp(s.x, e.x, at), y: e.y }]
        : [{ x: s.x, y: lerp(s.y, e.y, at) }, { x: e.x, y: lerp(s.y, e.y, at) }]
      return { kind: 'polyline', points: withoutRepeats([start, s, ...turn, e, end]) }
    }

    case 'curved': {
      /*
       * Control points straight out of each edge, so the curve leaves and
       * arrives perpendicular to the thing it is attached to — and with it
       * the arrowheads, which are oriented by the first and last segments of
       * the route rather than by the line between the ends.
       *
       * An end attached to nothing keeps the old offset along the run's
       * dominant axis, which is all there is to go on.
       */
      const cubic = defaultCubic(start, end, normals)
      if (bend === null) return { kind: 'cubic', points: cubic }

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
      const [, c1, c2] = cubic
      const target = bendAnchor(start, end, routing, bend, normals)
      const mid = cubicMiddle(cubic)
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
