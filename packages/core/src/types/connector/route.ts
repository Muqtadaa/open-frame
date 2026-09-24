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
 * The one point an ORTHOGONAL route is held by, of however many it has.
 *
 * ONE SITE for the fact that one routing still understands a single bend, so
 * there is one place to look rather than seven. Straight and curved routes
 * read the whole list; an orthogonal route is dragged by its legs rather than
 * by points in space, which is a different gesture and a stage of its own.
 */
export function heldPoint(points: readonly Bend[]): Bend | null {
  return points[0] ?? null
}

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

/**
 * Where a held point sits in the world.
 *
 * `along` is a fraction of the run between the ends and `across` a distance
 * perpendicular to it, so a point keeps its place relative to the line when
 * either end moves — which is the whole reason the position is stored this way
 * rather than as a board coordinate.
 */
export function pointAt(start: Point, end: Point, bend: Bend): Point {
  const mid = middle(start, end)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return mid
  const ux = dx / length
  const uy = dy / length
  const slide = length * (bend.along - 0.5)
  return {
    x: mid.x + ux * slide - uy * bend.across,
    y: mid.y + uy * slide + ux * bend.across,
  }
}

/** The inverse: what a point dropped HERE is, in the run's own terms. */
export function bendAt(start: Point, end: Point, at: Point): Bend {
  const mid = middle(start, end)
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return NO_BEND
  const ux = dx / length
  const uy = dy / length
  const px = at.x - mid.x
  const py = at.y - mid.y
  return {
    along: 0.5 + (px * ux + py * uy) / length,
    across: -px * uy + py * ux,
  }
}

/** Every place the route is pinned, in order: the two ends and what is between. */
export function routeNodes(start: Point, end: Point, points: readonly Bend[]): Point[] {
  return [start, ...points.map((bend) => pointAt(start, end, bend)), end]
}

/**
 * A third of the way from one node to the next.
 *
 * The tangent for an end attached to NOTHING, which has no normal to leave
 * along. A control point sitting exactly on its own anchor gives that end a
 * zero-length tangent, and a cubic with one of those leaves at whatever angle
 * the other three points imply — visibly kinked at the very place the line is
 * supposed to be smoothest.
 */
function towards(from: Point, to: Point): Point {
  return { x: from.x + (to.x - from.x) / 3, y: from.y + (to.y - from.y) / 3 }
}

/**
 * A smooth chain through every node, leaving each end along its anchor.
 *
 * Catmull-Rom tangents converted to Bezier control points: the direction at an
 * interior node is the line between its two neighbours, which is what makes
 * the joins smooth rather than kinked. The two ENDS are not free to choose —
 * they leave along the normal of whatever they are attached to, which is the
 * same rule a curve with no nodes at all follows, and without it a line
 * arriving at an edge would set off sideways the moment somebody bent it.
 *
 * Returned flattened as `p0, c1, c2, p1, …`, which is what an SVG path is and
 * what a hull of control points wants for bounds.
 */
function chainThrough(nodes: readonly Point[], normals: RouteNormals | null): Point[] {
  const out: Point[] = [nodes[0] ?? { x: 0, y: 0 }]
  for (let at = 0; at + 1 < nodes.length; at += 1) {
    const from = nodes[at]
    const to = nodes[at + 1]
    if (from === undefined || to === undefined) continue
    const before = nodes[at - 1]
    const after = nodes[at + 2]
    const reach = reachFor(from, to)

    /*
     * A sixth of the span to the node on the far side, which is the standard
     * Catmull-Rom tangent. At the two ends there is no node on the far side,
     * so the anchor's own normal takes its place — and with nothing attached
     * there either, the tangent simply points along the segment.
     */
    const leavingNormal = normals?.start ?? null
    const arrivingNormal = normals?.end ?? null
    const leaving =
      before !== undefined
        ? { x: from.x + (to.x - before.x) / 6, y: from.y + (to.y - before.y) / 6 }
        : leavingNormal !== null
          ? along(from, leavingNormal, reach)
          : towards(from, to)
    const arriving =
      after !== undefined
        ? { x: to.x - (after.x - from.x) / 6, y: to.y - (after.y - from.y) / 6 }
        : arrivingNormal !== null
          ? along(to, arrivingNormal, reach)
          : towards(to, from)

    out.push(leaving, arriving, to)
  }
  return out
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
 * A resolved route: straight segments, or a chain of curves.
 *
 * Two shapes rather than one, because flattening a curve to segments loses the
 * thing that makes it a curve and a polyline cannot describe one. Consumers
 * that need points ask `flattenRoute`; the renderer asks for neither and reads
 * the shape directly.
 */
export type Route =
  | { readonly kind: 'polyline'; readonly points: readonly Point[] }
  /**
   * A chain of cubics, flattened: `p0, c1, c2, p1, c1, c2, p2, …`, so the
   * length is always `1 + 3n`. One segment is the old single-cubic case.
   *
   * A CHAIN because a curve held at three places cannot be one cubic and still
   * pass through all three — and passing through them is the promise the
   * single bend already made, since the route was shifted so the curve's own
   * midpoint landed under the handle. A vertex you placed is a position, not a
   * suggestion.
   */
  | { readonly kind: 'spline'; readonly points: readonly Point[] }

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
 * Where an orthogonal route's ELBOW handle sits.
 *
 * With no bend this is the middle of the run between the stubs, which is where
 * the route's middle segment is centred by construction — a handle that
 * started anywhere else would jump on first touch.
 *
 * ORTHOGONAL ONLY. The other two routings pass through the points they are
 * given, so a point's place on them is `pointAt` and needs no second answer;
 * this one is a different thing wearing the same clothes, because an elbow is
 * not a place the line goes through but the offset of a segment that has to
 * stay square.
 */
export function elbowAnchor(
  start: Point,
  end: Point,
  bend: Bend | null,
  normals: RouteNormals | null = null,
): Point {
  /*
   * Between the STUBS, not between the ends: the middle segment of an
   * orthogonal route starts where the departure finishes. Measuring against
   * the ends instead would put the handle a stub's length off the line it is
   * supposed to be on.
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

/**
 * The bend an elbow dropped HERE describes — the inverse of `elbowAnchor`.
 *
 * Inverting rather than storing the point is what makes the bend survive the
 * objects moving: a fraction still means something after both ends have gone
 * somewhere else, and a point does not.
 */
export function elbowFrom(
  start: Point,
  end: Point,
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

/** The route, as the renderer and everything else sees it. */
export function connectorRoute(
  start: Point,
  end: Point,
  routing: Routing,
  points: readonly Bend[],
  normals: RouteNormals | null = null,
): Route {
  switch (routing) {
    case 'straight':
      /*
       * Straight between each node, and straight out of each end: a straight
       * route cannot leave along a normal and still arrive where it is going,
       * and pretending otherwise would make the one routing that promises
       * nothing the one that lies. With no nodes this is the line itself.
       */
      return { kind: 'polyline', points: routeNodes(start, end, points) }

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
       *
       * ONE point still, where the other two routings take a list: an
       * orthogonal route through several stops is a different problem — each
       * leg is dragged by its own side rather than by a point in space — and
       * doing it here would give it the wrong gesture. It has a stage of its
       * own.
       */
      const bend = heldPoint(points)
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
       * dominant axis, which is all there is to go on. That fallback is why
       * an unbent curve is still built here rather than by the chain: the
       * chain's own fallback points along the segment, which for a single
       * segment is a straight line, and every plain curve on every board
       * would have flattened.
       */
      const nodes = routeNodes(start, end, points)
      if (nodes.length <= 2) return { kind: 'spline', points: defaultCubic(start, end, normals) }
      return { kind: 'spline', points: chainThrough(nodes, normals) }
    }
  }
}

/**
 * One drawn stretch of the route, between two of the places it is pinned.
 *
 * ONE decomposition, because four things want it and they must agree: the
 * midpoint handle that adds a vertex sits at `middle`, the stretch it appears
 * over is `path`, distance-to-the-line walks `path`, and the label sits half
 * way along all of them. Computing any of those separately is how a handle
 * ends up somewhere the line is not.
 */
export interface RouteSegment {
  /** The middle of this stretch — of the CURVE, where it is one. */
  readonly middle: Point
  /** The stretch as straight pieces, with at least its two ends. */
  readonly path: readonly Point[]
}

/** A cubic at an arbitrary t. */
function cubicAt(p0: Point, c1: Point, c2: Point, p3: Point, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  }
}

/**
 * The route stretch by stretch.
 *
 * A curve is SAMPLED, because "how far is this click from the line" has no
 * closed form for a cubic worth writing. Sixteen steps puts the error well
 * inside the padding the hit test allows.
 */
export function routeSegments(route: Route, steps = 16): readonly RouteSegment[] {
  const segments: RouteSegment[] = []

  if (route.kind === 'polyline') {
    for (let index = 1; index < route.points.length; index += 1) {
      const from = route.points[index - 1]
      const to = route.points[index]
      if (from === undefined || to === undefined) continue
      segments.push({ middle: middle(from, to), path: [from, to] })
    }
    return segments
  }

  for (let index = 0; index + 3 < route.points.length; index += 3) {
    const p0 = route.points[index]
    const c1 = route.points[index + 1]
    const c2 = route.points[index + 2]
    const p3 = route.points[index + 3]
    if (p0 === undefined || c1 === undefined || c2 === undefined || p3 === undefined) continue
    const path: Point[] = []
    for (let step = 0; step <= steps; step += 1) path.push(cubicAt(p0, c1, c2, p3, step / steps))
    segments.push({ middle: cubicMiddle([p0, c1, c2, p3]), path })
  }
  return segments
}

/**
 * Points that CONTAIN the route, for bounds.
 *
 * A cubic never leaves the convex hull of its four control points, so those
 * are a correct superset without evaluating anything — and a chain of cubics
 * is contained by the hull of all of them. Bounds are allowed to be a superset
 * — rule 16 says so, which is why hit testing asks a second time.
 */
export function routeVertices(route: Route): readonly Point[] {
  return route.points
}

/** The route as straight segments, for measuring distance to it. */
export function flattenRoute(route: Route, steps = 16): readonly Point[] {
  if (route.kind === 'polyline') return route.points

  const points: Point[] = []
  for (const segment of routeSegments(route, steps)) {
    // The joint between two stretches belongs to both; taken from both it
    // becomes a zero-length piece, which has no direction to report.
    for (let index = points.length === 0 ? 0 : 1; index < segment.path.length; index += 1) {
      const point = segment.path[index]
      if (point !== undefined) points.push(point)
    }
  }
  return points
}

/**
 * Half way along the DRAWN route, for placing a label.
 *
 * By ARC LENGTH rather than by segment count, because a route held at several
 * places has no middle segment to nominate and the two legs either side of a
 * vertex are rarely the same length. A label a third of the way along a line
 * reads as attached to the wrong end of it.
 *
 * This used to be the same point as the bend handle, which was worth keeping
 * while a route had exactly one. It cannot be now: there is no longer one
 * handle to agree with.
 */
export function routeMidpoint(route: Route): Point {
  const points = flattenRoute(route)
  const first = points[0] ?? { x: 0, y: 0 }

  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    if (from === undefined || to === undefined) continue
    total += Math.hypot(to.x - from.x, to.y - from.y)
  }
  if (total === 0) return first

  let walked = 0
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    if (from === undefined || to === undefined) continue
    const step = Math.hypot(to.x - from.x, to.y - from.y)
    if (walked + step >= total / 2) {
      const t = step === 0 ? 0 : (total / 2 - walked) / step
      return { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) }
    }
    walked += step
  }
  return points[points.length - 1] ?? first
}
