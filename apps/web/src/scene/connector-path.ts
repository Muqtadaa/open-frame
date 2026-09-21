import { bendAnchor, connectorRoute, type Bend, type Point, type Routing } from '@openframe/core'

/** Arrowhead size in world units at 100% zoom. */
export const ARROW_SIZE = 9

/**
 * The SVG path for a connector.
 *
 * Pure geometry over already-resolved endpoints — resolution itself lives in
 * the domain, because it depends on the document. Keeping the two apart means
 * routing can change without touching anything that knows about objects.
 */
export function connectorPath(
  start: Point,
  end: Point,
  routing: Routing,
  bend: Bend | null = null,
): string {
  const route = connectorRoute(start, end, routing, bend)
  const [first, ...rest] = route.points
  if (first === undefined) return ''
  const from = `M ${String(first.x)} ${String(first.y)}`

  if (route.kind === 'cubic') {
    const [c1, c2, last] = rest as [Point, Point, Point]
    return `${from} C ${String(c1.x)} ${String(c1.y)}, ${String(c2.x)} ${String(c2.y)}, ${String(last.x)} ${String(last.y)}`
  }

  return rest.reduce((path, point) => `${path} L ${String(point.x)} ${String(point.y)}`, from)
}

/**
 * The middle of the DRAWN route, for placing a label.
 *
 * `bendAnchor` is the same point the bend handle sits on, which is not an
 * accident worth losing: the label and the handle both mean "the middle of
 * this line", and computing them separately is how they drift apart.
 */
export function pathMidpoint(
  start: Point,
  end: Point,
  routing: Routing = 'straight',
  bend: Bend | null = null,
): Point {
  return bendAnchor(start, end, routing, bend)
}

/**
 * Which way the route runs where it MEETS each end.
 *
 * Both together, because they are not the same answer and pretending they were
 * is what made connectors wrong. A cap is oriented by the segment it sits on,
 * not by the straight line between the two endpoints — on any route that bends
 * those differ, and the cap ends up rotated off the line it is supposed to
 * finish.
 *
 * `departure` points AWAY from `start`, along the first segment. `arrival`
 * points INTO `end`, along the last. A start cap is therefore drawn at
 * `departure + PI`, so that it faces back out of the line exactly as the end
 * cap faces into it.
 */
export interface RouteAngles {
  readonly departure: number
  readonly arrival: number
}

/**
 * The first point along the route that is actually somewhere else.
 *
 * A route can start with a zero-length segment — an elbow dragged all the way
 * onto one of the ends — and `atan2(0, 0)` is zero, which points a cap due
 * east regardless of where the line goes.
 */
function distinctFrom(points: readonly Point[], from: number, step: number): Point | undefined {
  const origin = points[from]
  if (origin === undefined) return undefined
  for (let index = from + step; index >= 0 && index < points.length; index += step) {
    const candidate = points[index]
    if (candidate === undefined) continue
    if (candidate.x !== origin.x || candidate.y !== origin.y) return candidate
  }
  return undefined
}

/**
 * READ OFF THE ROUTE, rather than worked out a second time.
 *
 * This used to re-derive which way the route left each end from the same
 * dominant-axis rule `connectorPath` used — and got it inverted, so every
 * orthogonal connector finished with its arrowhead turned ninety degrees off
 * its own line. Two pieces of code answering one question is what allowed
 * that, and a bend would have given them a third way to disagree.
 */
export function routeAngles(
  start: Point,
  end: Point,
  routing: Routing,
  bend: Bend | null = null,
): RouteAngles {
  const points = connectorRoute(start, end, routing, bend).points
  const straight = Math.atan2(end.y - start.y, end.x - start.x)

  const afterStart = distinctFrom(points, 0, 1)
  const beforeEnd = distinctFrom(points, points.length - 1, -1)
  const first = points[0]
  const last = points[points.length - 1]
  if (afterStart === undefined || beforeEnd === undefined || first === undefined || last === undefined) {
    return { departure: straight, arrival: straight }
  }

  return {
    departure: Math.atan2(afterStart.y - first.y, afterStart.x - first.x),
    arrival: Math.atan2(last.y - beforeEnd.y, last.x - beforeEnd.x),
  }
}

/** Angle the path arrives at `end`, for orienting an end cap. */
export function arrivalAngle(
  start: Point,
  end: Point,
  routing: Routing,
  bend: Bend | null = null,
): number {
  return routeAngles(start, end, routing, bend).arrival
}
