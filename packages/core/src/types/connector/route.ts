import type { Point } from '../../geometry/point.js'
import type { Rect } from '../../geometry/rect.js'
import type { Bend, LabelPlacement, Routing } from './schema.js'

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
  stretch = 1,
): [Point, Point, Point, Point] {
  /*
   * With a normal the control point goes straight out of the edge; without
   * one it falls back to the offset along the run's dominant axis, which is
   * what every curve did before ends knew which way they faced.
   */
  const reach = reachFor(start, end) * stretch
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

/**
 * Every place the route is pinned, in order: the two ends and what is between.
 *
 * WITH PROVENANCE, because two callers need to agree about it: the route is
 * drawn through these, and the handles are placed against them. `stop` is the
 * index in `points` a node came from, or null for one of the two ends — which
 * is what lets a midpoint handle say where in the LIST a new point would go
 * rather than merely which stretch it sits on.
 */
export interface RouteStop {
  readonly at: Point
  readonly stop: number | null
}

/**
 * Whether two places are the same place, to well under a drawn pixel.
 *
 * NOT `===`. A stop is stored as a fraction along the run and an offset across
 * it, so landing one exactly on another means a round trip through that pair
 * and back — and floating point brings it home a ten-thousandth of a
 * millionth out. Compared exactly, the leg between them is not empty, so it
 * survives as a corner the route visibly turns at: dragging the crossing of a
 * plain elbow added a turn nobody asked for.
 *
 * A millionth of a world unit is a nanometre on a board and a hundred million
 * times the error.
 */
const TOUCHING = 1e-6

export function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < TOUCHING && Math.abs(a.y - b.y) < TOUCHING
}

/**
 * The pinned places, with any that have been dragged ONTO a neighbour dropped.
 *
 * This is how a stop is removed. The gesture cannot take it out of the data
 * mid-drag — every index after it would shift, and the hand that was moving
 * stop 2 would find itself moving what used to be stop 3 — so a stop dropped
 * on its neighbour is snapped exactly onto it and the route simply stops
 * pinning there. What is drawn is then exactly what letting go commits, which
 * is the whole contract of a preview.
 *
 * An END never loses: a stop pushed onto one is the one that goes, or the line
 * would finish somewhere other than the thing it is attached to.
 */
export function routeStops(start: Point, end: Point, points: readonly Bend[]): RouteStop[] {
  const all: RouteStop[] = [
    { at: start, stop: null },
    ...points.map((bend, index) => ({ at: pointAt(start, end, bend), stop: index })),
    { at: end, stop: null },
  ]

  const kept: RouteStop[] = []
  for (const node of all) {
    const last = kept[kept.length - 1]
    if (last !== undefined && samePoint(last.at, node.at)) {
      if (node.stop === null) kept.pop()
      else continue
    }
    kept.push(node)
  }
  return kept
}

/** Every pinned place as a bare point, ends included. */
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
 * WHICH AXIS a leg runs along. `x` is horizontal, so a drag moves it in y.
 */
export type LegAxis = 'x' | 'y'

/**
 * The place a leg is held, and so what moving it has to change.
 *
 * A leg's fixed coordinate always comes from one node of the route: a stop it
 * passes through, an end it leaves, or — on a route with no stops at all — the
 * middle it crosses at. `insert` says that node is not in the list yet, so
 * moving the leg puts it there; `at` is where that node currently is, and the
 * drag replaces ONE of its coordinates. Inheriting the other is what stops a
 * drag from adding a jog nobody asked for: the leg before it collapses to
 * nothing and disappears.
 *
 * The leg says all this itself because working it out a second time in the
 * gesture is how a handle comes to write to the wrong point.
 */
export interface LegAnchor {
  /** The stop it follows, or the slot a new one goes in. */
  readonly stop: number
  readonly insert: boolean
  readonly at: Point
  /** Where that node sits among all of them, which is how its two neighbours
   * are found — and they are what a leg snaps flush with. */
  readonly node: number
}

/** One straight run of an orthogonal route. */
export interface RouteLeg {
  readonly from: Point
  readonly to: Point
  readonly runs: LegAxis
  /**
   * Every node that must move for this leg to move. EMPTY means pinned: the
   * stub out of each end is where the line meets the thing it is attached to,
   * and that is not negotiable.
   *
   * A list rather than one, because two parallel legs at the same coordinate
   * are drawn as a single run — that is what merging two of them looks like —
   * and moving it has to take both with it or the path tears.
   */
  readonly moves: readonly LegAnchor[]
}

/** The axis a route leaves an end on, which is what its stub runs along. */
function departureAxis(from: Point, stub: Point, other: Point): LegAxis {
  if (stub.x !== from.x) return 'x'
  if (stub.y !== from.y) return 'y'
  // A free end has no direction of its own, so the run decides.
  return isHorizontal(from, other) ? 'x' : 'y'
}

/** Drops empty legs, then merges any two that run along the same axis. */
function tidyLegs(legs: readonly RouteLeg[]): RouteLeg[] {
  const kept: RouteLeg[] = []
  for (const leg of legs) {
    if (samePoint(leg.from, leg.to)) continue
    const last = kept[kept.length - 1]
    /*
     * A PINNED leg never merges. The stub out of each end is one, and folding
     * it into the run that follows loses the departure entirely: a line
     * leaving a right edge towards something on the left came back as a
     * single leg heading LEFT, so the arrowhead — which is oriented by the
     * route's own first segment — turned round to face the object it was
     * leaving. It would also make the pinned half of the merged leg look
     * draggable, which is a handle that writes somewhere it must not.
     */
    if (last?.runs === leg.runs && last.moves.length > 0 && leg.moves.length > 0) {
      // Connected and along the same axis means collinear, so the two are one
      // run of the line — and whoever drags it moves both of their nodes.
      kept[kept.length - 1] = {
        from: last.from,
        to: leg.to,
        runs: leg.runs,
        moves: [...last.moves, ...leg.moves],
      }
      continue
    }
    kept.push(leg)
  }
  return kept
}

/**
 * An orthogonal route, leg by leg.
 *
 * ONE decomposition for the shape and the handles alike: the polyline is these
 * legs end to end, and what you can grab is these legs. Two functions
 * answering that separately is how a handle comes to sit where the line is
 * not.
 *
 * The walk ALTERNATES: out of each node perpendicular to the run just drawn,
 * then along it again. That is what makes a stop a corner rather than a
 * suggestion, and a staircase reachable at all — and where a node lies on the
 * line the route was already taking, the perpendicular leg is empty and
 * disappears, which is how one drag bends a route without also folding it.
 *
 * With NO stops the walk is seeded with the midpoint it would otherwise have
 * to invent, so the default is exactly the route this always drew: out of each
 * edge, across the middle, and in. Dragging either free leg of it turns that
 * midpoint into a real stop.
 */
/**
 * How far clear of a shape a route is routed, in world units.
 *
 * Less than the stub, deliberately: the stub already stands a connector 16
 * units off the edge it leaves, so at 12 the run out of an object is clear of
 * that object's own halo by four and nothing has to make an exception for the
 * thing the line is attached to.
 */
const CLEARANCE = 12

/** The shapes a route is asked to get round: the two it joins, or neither. */
export type Obstacles = readonly Rect[]

function grown(box: Rect, by: number): Rect {
  return { x: box.x - by, y: box.y - by, width: box.width + by * 2, height: box.height + by * 2 }
}

/**
 * Whether a straight run passes THROUGH a box, rather than touching its edge.
 *
 * Strictly inside on both axes, because a route that runs exactly along an
 * inflated edge is a route that has already been moved clear — counting that
 * as a crossing would send it round again, and again.
 */
function crosses(from: Point, to: Point, box: Rect): boolean {
  return (
    Math.max(from.x, to.x) > box.x &&
    Math.min(from.x, to.x) < box.x + box.width &&
    Math.max(from.y, to.y) > box.y &&
    Math.min(from.y, to.y) < box.y + box.height
  )
}

/** The nearer side of a box to stand clear of, along one axis. */
function clearOf(value: number, low: number, high: number): number {
  return value - low <= high - value ? low : high
}

export function orthogonalNodes(
  start: Point,
  end: Point,
  points: readonly Bend[],
  normals: RouteNormals | null = null,
  avoiding: Obstacles = [],
): Point[] {
  const [s, e] = stubs(start, end, normals)
  /*
   * A route you have SHAPED is yours. Every node is then one you put there,
   * and moving one to get round something would be answering a question you
   * have already answered by hand.
   */
  if (points.length > 0) return [s, ...points.map((bend) => pointAt(start, end, bend)), e]

  /*
   * With nothing stored, the middle the route crosses at stands in for a stop
   * — so the default is exactly the route this always drew: out of each edge,
   * across the middle, and in. Dragging either free leg of it turns that
   * middle into a real stop, and until then it is a node like any other.
   */
  const horizontal = isHorizontal(s, e)
  const middle = horizontal
    ? { x: lerp(s.x, e.x, 0.5), y: s.y }
    : { x: s.x, y: lerp(s.y, e.y, 0.5) }

  return [s, roundObstacles(s, middle, e, horizontal, avoiding), e]
}

/**
 * The middle, moved until neither run it holds goes through a shape.
 *
 * TWO coordinates and two runs, which is more than it sounds: moving the
 * crossing sideways clears the box it was running down the middle of, and
 * moving the run that leaves an object up or down takes the whole leg over
 * the top of it. Between them they handle the case this exists for — a line
 * joining two objects whose boxes lie between them, most of all one doubling
 * back over the thing it just left.
 *
 * A PASS PER SHAPE, and no more: each move is to the nearer side of whatever
 * is in the way, so a second look can only find the other shape. Left to
 * iterate it could push a route back and forth between two boxes for ever.
 */
function roundObstacles(
  s: Point,
  middle: Point,
  e: Point,
  horizontal: boolean,
  avoiding: Obstacles,
): Point {
  let at = middle
  for (const rect of avoiding) {
    const box = grown(rect, CLEARANCE)
    // The run OUT of the start, which this node holds the far coordinate of.
    const leaving = horizontal
      ? [{ x: s.x, y: at.y }, { x: at.x, y: at.y }]
      : [{ x: at.x, y: s.y }, { x: at.x, y: at.y }]
    const [leaveFrom, leaveTo] = leaving
    if (leaveFrom !== undefined && leaveTo !== undefined && crosses(leaveFrom, leaveTo, box)) {
      at = horizontal
        ? { x: at.x, y: clearOf(at.y, box.y, box.y + box.height) }
        : { x: clearOf(at.x, box.x, box.x + box.width), y: at.y }
    }
    // And the crossing run, between the two.
    const crossing = horizontal
      ? [{ x: at.x, y: at.y }, { x: at.x, y: e.y }]
      : [{ x: at.x, y: at.y }, { x: e.x, y: at.y }]
    const [crossFrom, crossTo] = crossing
    if (crossFrom !== undefined && crossTo !== undefined && crosses(crossFrom, crossTo, box)) {
      at = horizontal
        ? { x: clearOf(at.x, box.x, box.x + box.width), y: at.y }
        : { x: at.x, y: clearOf(at.y, box.y, box.y + box.height) }
    }
  }
  return at
}

export function orthogonalLegs(
  start: Point,
  end: Point,
  points: readonly Bend[],
  normals: RouteNormals | null = null,
  avoiding: Obstacles = [],
): RouteLeg[] {
  const [s, e] = stubs(start, end, normals)
  /*
   * The run's own dominant axis decides which way the route crosses, as it
   * always has — NOT the direction it departs in. Those differ whenever a line
   * leaves a top edge towards something mostly sideways, and taking the
   * departure would turn every one of those routes inside out.
   */
  const last: LegAxis = isHorizontal(s, e) ? 'x' : 'y'
  const nodes = orthogonalNodes(start, end, points, normals, avoiding)

  const targets = nodes.slice(1).map((at, index) => ({
    at,
    anchor: {
      // The last node is the far stub: moving a leg it holds has to put a stop
      // at the end of the list, since there is nothing there to move.
      stop: index + 1 === nodes.length - 1 ? points.length : index,
      insert: points.length === 0 || index + 1 === nodes.length - 1,
      at,
      node: index + 1,
    },
  }))

  const legs: RouteLeg[] = [{ from: start, to: s, runs: departureAxis(start, s, end), moves: [] }]
  let cursor = s
  let cursorAnchor: LegAnchor = { stop: 0, insert: true, at: s, node: 0 }

  for (const target of targets) {
    const across: LegAxis = last === 'x' ? 'y' : 'x'
    /*
     * The corner takes one coordinate from each end of the pair, which is
     * exactly what decides who has to move when a leg is dragged: the run OUT
     * is held where it came from, the run ALONG by where it is going.
     */
    const corner =
      across === 'y' ? { x: cursor.x, y: target.at.y } : { x: target.at.x, y: cursor.y }
    legs.push({ from: cursor, to: corner, runs: across, moves: [cursorAnchor] })
    legs.push({ from: corner, to: target.at, runs: last, moves: [target.anchor] })
    cursor = target.at
    cursorAnchor = target.anchor
  }

  legs.push({ from: e, to: end, runs: departureAxis(end, e, start), moves: [] })
  return tidyLegs(legs)
}

/**
 * The plain curve, leaving each end far enough out to clear both shapes.
 *
 * A curve has no corners to add, so the only way it gets round anything is by
 * LEAVING FURTHER before it turns — the control points go out along the same
 * normals, just further. That is enough for the case this exists for, a line
 * doubling back over the object it is attached to, and it is honest about the
 * case it cannot fix: on a tight geometry no amount of bow clears the box, and
 * the widest attempt is what gets drawn rather than a shape nobody asked for.
 *
 * Tried in a few steps rather than solved, because "the smallest reach that
 * clears" has no closed form worth writing and the curve is sampled to test it
 * anyway.
 */
const STRETCHES = [1, 1.7, 2.6, 3.8]

function clearingCubic(
  start: Point,
  end: Point,
  normals: RouteNormals | null,
  avoiding: Obstacles,
): [Point, Point, Point, Point] {
  const boxes = avoiding.map((rect) => grown(rect, CLEARANCE))
  const plain = defaultCubic(start, end, normals)
  /*
   * A CHEAP REJECT first, because this runs in the cull: a cubic never leaves
   * the hull of its four control points, so a hull that misses every box means
   * the curve does too and nothing needs sampling. Most curves on most boards
   * take this branch.
   */
  const hull = {
    x: Math.min(...plain.map((point) => point.x)),
    y: Math.min(...plain.map((point) => point.y)),
    width: Math.max(...plain.map((point) => point.x)) - Math.min(...plain.map((point) => point.x)),
    height: Math.max(...plain.map((point) => point.y)) - Math.min(...plain.map((point) => point.y)),
  }
  if (!boxes.some((box) => crosses({ x: hull.x, y: hull.y }, { x: hull.x + hull.width, y: hull.y + hull.height }, box))) {
    return plain
  }

  let widest = plain
  for (const stretch of STRETCHES) {
    const cubic = defaultCubic(start, end, normals, stretch)
    widest = cubic
    /*
     * Sampled at the ends EXCLUDED: a curve attached to a box starts on its
     * edge, so the first and last samples are inside the inflated box by
     * definition and would condemn every curve there is.
     */
    const path = routeSegments({ kind: 'spline', points: cubic }, 24)[0]?.path ?? []
    const inside = path
      .slice(2, -2)
      .some((point) => boxes.some((box) => crosses(point, point, box)))
    if (!inside) return cubic
  }
  return widest
}

/** The route, as the renderer and everything else sees it. */
export function connectorRoute(
  start: Point,
  end: Point,
  routing: Routing,
  points: readonly Bend[],
  normals: RouteNormals | null = null,
  /**
   * The shapes to get round: the two this line joins, or neither.
   *
   * Only the two it is attached to, because those are the ones it is always
   * near — a route that dodged everything on the board would rearrange itself
   * whenever anything moved anywhere, which is a worse surprise than a line
   * crossing something once.
   */
  avoiding: Obstacles = [],
): Route {
  switch (routing) {
    case 'straight':
      /*
       * Straight between each node, and straight out of each end: a straight
       * route cannot leave along a normal and still arrive where it is going,
       * and pretending otherwise would make the one routing that promises
       * nothing the one that lies. With no nodes this is the line itself.
       */
      return { kind: 'polyline', points: routeStops(start, end, points).map((node) => node.at) }

    case 'orthogonal': {
      /*
       * OUT of each edge first, then turn, and a right angle at every stop.
       * The legs are the shape AND what you grab to change it, worked out in
       * one place so the two cannot disagree — see `orthogonalLegs`.
       *
       * Without the stubs a line leaving a right edge towards something on
       * the left turned immediately and ran back over the object it had just
       * left — which is the same fault as an arrowhead pointing along an
       * object rather than into it, in a different routing.
       */
      const legs = orthogonalLegs(start, end, points, normals, avoiding)
      const first = legs[0]
      if (first === undefined) return { kind: 'polyline', points: [start, end] }
      return {
        kind: 'polyline',
        points: withoutRepeats([first.from, ...legs.map((leg) => leg.to)]),
      }
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
      const nodes = routeStops(start, end, points).map((node) => node.at)
      /*
       * A curve you have SHAPED is yours, exactly as a staircase is: the
       * chain passes through the stops it was given and nothing moves them.
       */
      if (nodes.length <= 2) {
        return { kind: 'spline', points: clearingCubic(start, end, normals, avoiding) }
      }
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


/** How long a flattened path is, and how far along each vertex sits. */
function walkOf(path: readonly Point[]): { total: number; upto: number[] } {
  const upto: number[] = [0]
  let total = 0
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]
    const to = path[index]
    if (from === undefined || to === undefined) continue
    total += Math.hypot(to.x - from.x, to.y - from.y)
    upto.push(total)
  }
  return { total, upto }
}

/** Where a fraction of the way along a path lands, and which way it is going. */
function alongPath(path: readonly Point[], fraction: number): { at: Point; way: Point } {
  const { total, upto } = walkOf(path)
  const first = path[0] ?? { x: 0, y: 0 }
  if (total === 0) return { at: first, way: { x: 1, y: 0 } }
  const target = Math.min(Math.max(fraction, 0), 1) * total
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]
    const to = path[index]
    const reached = upto[index]
    const before = upto[index - 1]
    if (from === undefined || to === undefined || reached === undefined || before === undefined) {
      continue
    }
    if (reached < target && index < path.length - 1) continue
    const span = reached - before
    const t = span === 0 ? 0 : (target - before) / span
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1
    return {
      at: { x: lerp(from.x, to.x, t), y: lerp(from.y, to.y, t) },
      way: { x: (to.x - from.x) / length, y: (to.y - from.y) / length },
    }
  }
  return { at: first, way: { x: 1, y: 0 } }
}

/**
 * Where a connector's label sits.
 *
 * UNPLACED, it takes the middle of the route's LONGEST run, so the text lies
 * along a straight stretch rather than draped over a corner — which is where
 * half way along puts it on any route that turns in the middle, and most of
 * them do. On a route with one run the two are the same point, so nothing
 * moves on a straight line or a plain curve.
 *
 * PLACED, it is a fraction of the drawn route's length and an offset across
 * it, so the label travels with the line: it stays on the leg it was put on
 * instead of sliding round as the objects move.
 */
export function labelAnchor(route: Route, label: LabelPlacement | null | undefined): Point {
  if (label === null || label === undefined) {
    /*
     * The longest run, and on a TIE the most central of them. A plain squared
     * route is three runs of the same length, so first-past-the-post would
     * park every label on the stretch leaving the object rather than on the
     * crossing between the two, which is where a hand would put it.
     */
    const segments = routeSegments(route)
    let best: { at: Point; length: number; offCentre: number } | null = null
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      if (segment === undefined) continue
      const length = walkOf(segment.path).total
      const offCentre = Math.abs(index - (segments.length - 1) / 2)
      const better =
        best === null || length > best.length || (length === best.length && offCentre < best.offCentre)
      if (better) best = { at: segment.middle, length, offCentre }
    }
    return best === null ? routeMidpoint(route) : best.at
  }

  const { at, way } = alongPath(flattenRoute(route), label.at)
  // The left-hand normal, so a positive offset is always the same side of the
  // line whichever way round the line was drawn.
  return { x: at.x - way.y * label.off, y: at.y + way.x * label.off }
}

/**
 * The placement a label dropped HERE describes — the inverse of `labelAnchor`.
 *
 * Nearest point on the drawn route, then how far off it the drop was. Stored
 * that way rather than as a coordinate for the same reason a stop is: a
 * fraction and an offset still mean something once both ends have moved, and
 * a point does not.
 */
export function labelFrom(route: Route, point: Point): LabelPlacement {
  const path = flattenRoute(route)
  const { total, upto } = walkOf(path)
  if (total === 0) return { at: 0.5, off: 0 }

  let best: { at: number; off: number; away: number } | null = null
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]
    const to = path[index]
    const before = upto[index - 1]
    if (from === undefined || to === undefined || before === undefined) continue
    const dx = to.x - from.x
    const dy = to.y - from.y
    const span = Math.hypot(dx, dy)
    if (span === 0) continue
    const t = Math.min(Math.max(((point.x - from.x) * dx + (point.y - from.y) * dy) / (span * span), 0), 1)
    const on = { x: from.x + dx * t, y: from.y + dy * t }
    const away = Math.hypot(point.x - on.x, point.y - on.y)
    if (best !== null && away >= best.away) continue
    best = {
      at: (before + span * t) / total,
      // Signed against the left-hand normal, matching `labelAnchor`.
      off: -(point.x - on.x) * (dy / span) + (point.y - on.y) * (dx / span),
      away,
    }
  }
  return best === null ? { at: 0.5, off: 0 } : { at: best.at, off: best.off }
}
