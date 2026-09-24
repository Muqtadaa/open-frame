import { describe, expect, it } from 'vitest'

import { distanceToSegment, type Point } from '../../geometry/point.js'
import {
  bendAt,
  connectorRoute,
  elbowAnchor,
  elbowFrom,
  flattenRoute,
  pointAt,
  routeSegments,
  NO_BEND,
} from './route.js'

const start = { x: 0, y: 0 }
const end = { x: 200, y: 100 }

describe('where the handle sits', () => {
  /*
   * On the route AS DRAWN, for every routing — an orthogonal route's middle
   * segment is centred there by construction, and the default curve's control
   * points are placed so its own midpoint lands there too. A handle that
   * started anywhere else would jump on first touch.
   */
  it('starts at the middle of the drawn route, whatever the routing', () => {
    expect(elbowAnchor(start, end, null)).toEqual({ x: 100, y: 50 })
    for (const routing of ['straight', 'curved'] as const) {
      const [segment] = routeSegments(connectorRoute(start, end, routing, []))
      expect(segment?.middle).toEqual({ x: 100, y: 50 })
    }
  })

  it('puts the default curve through its own handle', () => {
    const points = flattenRoute(connectorRoute(start, end, 'curved', []), 2)
    // The sampled midpoint of the untouched curve.
    expect(points[1]).toEqual({ x: 100, y: 50 })
  })
})

describe('describing a point from where it was dropped', () => {
  it('round-trips a vertex through the run it is measured against', () => {
    const at = { x: 150, y: 20 }
    const back = pointAt(start, end, bendAt(start, end, at))
    expect(back.x).toBeCloseTo(at.x, 6)
    expect(back.y).toBeCloseTo(at.y, 6)
  })

  it('round-trips an elbow along its own axis', () => {
    const at = { x: 150, y: 20 }
    const back = elbowAnchor(start, end, elbowFrom(start, end, at))
    // An orthogonal elbow only moves along the run, so the other axis is not a
    // round trip — it snaps back to the middle segment.
    expect(back.x).toBeCloseTo(at.x, 6)
    expect(back.y).toBeCloseTo(50, 6)
  })

  it('reads the middle as no offset at all', () => {
    const bend = bendAt(start, end, { x: 100, y: 50 })
    expect(bend.along).toBeCloseTo(0.5, 6)
    expect(bend.across).toBeCloseTo(0, 6)
  })

  it('survives two ends in the same place', () => {
    expect(bendAt(start, start, { x: 5, y: 5 })).toEqual(NO_BEND)
    expect(elbowFrom(start, start, { x: 5, y: 5 })).toEqual(NO_BEND)
  })
})

describe('the route itself', () => {
  it('turns at the halfway point when nothing says otherwise', () => {
    const route = connectorRoute(start, end, 'orthogonal', [])
    expect(route.points).toEqual([start, { x: 100, y: 0 }, { x: 100, y: 100 }, end])
  })

  it('moves the elbow where the bend says', () => {
    const route = connectorRoute(start, end, 'orthogonal', [{ along: 0.25, across: 0 }])
    expect(route.points).toEqual([start, { x: 50, y: 0 }, { x: 50, y: 100 }, end])
  })

  /*
   * The curve must pass through the handle EXACTLY, or the line slides out
   * from under the pointer as you drag it — the failure that makes a control
   * feel broken even though it is doing something.
   */
  it('puts the bent curve through the handle', () => {
    const bend = { along: 0.5, across: 60 }
    const target = pointAt(start, end, bend)
    // Two stretches now, so the vertex is the joint between them rather than
    // the midpoint of one: `p0, c, c, VERTEX, c, c, p1` sampled at both ends
    // and the middle of each.
    const points = flattenRoute(connectorRoute(start, end, 'curved', [bend]), 2)
    expect(points[2]?.x).toBeCloseTo(target.x, 6)
    expect(points[2]?.y).toBeCloseTo(target.y, 6)
  })

  it('passes through every point it is given, in order', () => {
    const bends = [
      { along: 0.25, across: 40 },
      { along: 0.75, across: -40 },
    ]
    const where = bends.map((bend) => pointAt(start, end, bend))
    for (const routing of ['straight', 'curved'] as const) {
      const drawn = flattenRoute(connectorRoute(start, end, routing, bends), 8)
      const visited = where.map((at) =>
        drawn.findIndex(
          (point) => Math.abs(point.x - at.x) < 1e-6 && Math.abs(point.y - at.y) < 1e-6,
        ),
      )
      // THROUGH each one, not near it.
      expect(visited.every((index) => index >= 0)).toBe(true)
      /*
       * And in ORDER, which is the half a presence check cannot see: a route
       * that visited them the other way round would satisfy the line above
       * while doubling back across itself.
       */
      expect(visited[0]).toBeLessThan(visited[1] ?? -1)
    }
  })

  it('keeps the ends where they were, however hard it is bent', () => {
    for (const routing of ['orthogonal', 'curved', 'straight'] as const) {
      const points = connectorRoute(start, end, routing, [{ along: 2.5, across: -300 }]).points
      expect(points[0]).toEqual(start)
      expect(points[points.length - 1]).toEqual(end)
    }
  })

  it('leaves a straight route straight when it holds no points at all', () => {
    expect(connectorRoute(start, end, 'straight', []).points).toEqual([start, end])
  })
})

/**
 * WHICH WAY THE LINE LEAVES, which is what makes a route meet an object
 * rather than merely reach it.
 *
 * Every curve used to take its control points from the run's dominant axis,
 * so a line anchored to a bottom edge left sideways — and the arrowheads are
 * oriented by the route's first and last segments, so the cap pointed along
 * the object instead of into it. That is the fault these hold.
 */
describe('leaving along the edge it is attached to', () => {
  const down = { x: 0, y: 1 }
  const up = { x: 0, y: -1 }
  const right = { x: 1, y: 0 }

  it('sends a curve straight out of the edge, not along the run', () => {
    const route = connectorRoute(start, end, 'curved', [], { start: down, end: null })
    if (route.kind !== 'spline') throw new Error('a curve is a spline')
    const [from, control] = route.points
    if (from === undefined || control === undefined) throw new Error('a cubic has four points')
    // The tangent at t=0 is the first control point minus the start.
    expect(control.x).toBeCloseTo(from.x, 6)
    expect(control.y).toBeGreaterThan(from.y)
  })

  it('arrives along the far edge, so the arrowhead points into it', () => {
    const route = connectorRoute(start, end, 'curved', [], { start: null, end: up })
    if (route.kind !== 'spline') throw new Error('a curve is a spline')
    const [, , control, to] = route.points
    if (control === undefined || to === undefined) throw new Error('a cubic has four points')
    // The tangent at t=1 is the end minus the last control point: the line
    // arrives travelling DOWNWARD into an end whose outward normal is up.
    expect(control.x).toBeCloseTo(to.x, 6)
    expect(control.y).toBeLessThan(to.y)
  })

  it('keeps the old shape for an end attached to nothing', () => {
    const free = connectorRoute(start, end, 'curved', [], { start: null, end: null })
    const none = connectorRoute(start, end, 'curved', [])
    expect(free).toEqual(none)
  })

  it('runs an orthogonal route out of the edge before it turns', () => {
    const route = connectorRoute(start, end, 'orthogonal', [], { start: down, end: null })
    const [first, second] = route.points
    if (first === undefined || second === undefined) throw new Error('two points at least')
    expect(second.x).toBeCloseTo(first.x, 6)
    expect(second.y).toBeGreaterThan(first.y)
  })

  /**
   * The case the stub exists for: leaving a right edge towards something on
   * the LEFT. Without it the route turned immediately and ran back across the
   * object it had just left.
   */
  it('leaves the right edge rightward even when the target is to the left', () => {
    const route = connectorRoute({ x: 200, y: 0 }, { x: 0, y: 100 }, 'orthogonal', [], {
      start: right,
      end: null,
    })
    const [first, second] = route.points
    if (first === undefined || second === undefined) throw new Error('two points at least')
    expect(second.x).toBeGreaterThan(first.x)
  })

  it('drops a stub that lands on the corner after it, so no segment is empty', () => {
    // A rightward departure towards a target directly right: the stub is
    // collinear with the turn, and a zero-length segment has no direction for
    // an arrowhead to take.
    const route = connectorRoute({ x: 0, y: 0 }, { x: 200, y: 0 }, 'orthogonal', [], {
      start: right,
      end: null,
    })
    const points = route.points
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1]
      const b = points[index]
      if (a === undefined || b === undefined) continue
      expect(`${String(a.x)},${String(a.y)}`).not.toBe(`${String(b.x)},${String(b.y)}`)
    }
  })
})

describe('the bend handle still sits on the line it bends', () => {
  /*
   * ASYMMETRIC on purpose. With the start leaving downward and the end
   * arriving from directly above, the two stubs cancel and the handle lands on
   * the straight midpoint anyway — so a test using them passes whether or not
   * the normals were consulted at all.
   */
  const normals = { start: { x: 0, y: 1 }, end: { x: 1, y: 0 } }

  /** How far a point is from the nearest segment of a drawn route. */
  const offRoute = (at: Point, points: readonly Point[]): number => {
    let nearest = Number.POSITIVE_INFINITY
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1]
      const b = points[index]
      if (a === undefined || b === undefined) continue
      nearest = Math.min(nearest, distanceToSegment(at, a, b))
    }
    return nearest
  }

  it.each(['curved', 'orthogonal'] as const)(
    'starts on the %s route as drawn, not on the straight line',
    (routing) => {
      const route = connectorRoute(start, end, routing, [], normals)
      const handle =
        routing === 'orthogonal'
          ? elbowAnchor(start, end, null, normals)
          : (routeSegments(route)[0]?.middle ?? { x: 0, y: 0 })
      const drawn = flattenRoute(route, 48)
      // On the line it bends, which is the whole contract: a handle anywhere
      // else jumps the moment it is touched.
      expect(offRoute(handle, drawn)).toBeLessThan(0.5)
      // And not simply the straight midpoint, or this would pass with the
      // normals ignored entirely.
      expect(offRoute({ x: 100, y: 50 }, drawn)).toBeGreaterThan(1)
    },
  )

  it('puts the bent curve through the point it was bent to, with normals', () => {
    const at = { x: 150, y: 20 }
    const bend = bendAt(start, end, at)
    const drawn = flattenRoute(connectorRoute(start, end, 'curved', [bend], normals), 8)
    const nearest = drawn.reduce(
      (best, point) => Math.min(best, Math.hypot(point.x - at.x, point.y - at.y)),
      Number.POSITIVE_INFINITY,
    )
    // EXACTLY through it, not near it: a curve that merely passes close by
    // slides out from under the pointer as it is dragged.
    expect(nearest).toBeLessThan(1e-6)
  })
})

/**
 * THE L, which is the shape people actually draw.
 *
 * An orthogonal route turns twice: out of one end, across, and into the other.
 * Pushed all the way to either end it becomes a single corner — and hitting
 * that exactly with a pointer is a pixel hunt, so the drag finds it.
 *
 * How close counts is the CALLER's number, not a constant here. That is what
 * lets the snap be stickier once it has taken — a wider distance to release
 * than to catch — without this having to remember anything between one pointer
 * event and the next.
 */
describe('collapsing an orthogonal route to one corner', () => {
  const normals = { start: { x: 0, y: -1 }, end: { x: 0, y: 1 } }
  /** Where the elbow sits, in world units along the run. */
  const elbowOf = (bend: ReturnType<typeof elbowFrom>): number =>
    elbowAnchor(start, end, bend, normals).x

  it('takes the L when the elbow is dropped near one end', () => {
    const near = { x: start.x + 6, y: 50 }
    expect(elbowFrom(start, end, near, normals, 14).along).toBe(0)

    const far = { x: end.x - 6, y: 50 }
    expect(elbowFrom(start, end, far, normals, 14).along).toBe(1)
  })

  it('leaves the elbow where it was put when nothing is near', () => {
    const middle = { x: 100, y: 50 }
    const bend = elbowFrom(start, end, middle, normals, 14)
    expect(bend.along).toBeCloseTo(0.5, 1)
    expect(elbowOf(bend)).toBeCloseTo(100, 6)
  })

  it('never snaps when the caller asks for none', () => {
    const near = { x: start.x + 6, y: 50 }
    expect(elbowFrom(start, end, near, normals, 0).along).not.toBe(0)
  })

  /**
   * The release is the same call with a bigger number, which is the whole
   * reason the distance is a parameter: a drag that has already taken the L
   * asks for a wider one, so the shape does not flicker while a hand hovers
   * at the threshold.
   */
  it('holds the L further out than it took it', () => {
    const at = { x: start.x + 20, y: 50 }
    expect(elbowFrom(start, end, at, normals, 14).along).not.toBe(0)
    expect(elbowFrom(start, end, at, normals, 28).along).toBe(0)
  })

  it('measures in world units, not as a fraction of the run', () => {
    const longEnd = { x: 1000, y: 100 }
    // The same six units from the start snaps on a long run as on a short one.
    expect(elbowFrom(start, longEnd, { x: 6, y: 50 }, normals, 14).along).toBe(0)

    /*
     * And the case the two rules DISAGREE about, which is the only one worth
     * asserting: sixty units out is 6% of this run. A fraction-based snap of
     * any usable size would take it; fourteen world units does not. A test
     * that only used points near the very start would pass either way — and
     * the first version of this one did.
     */
    const sixPercent = { x: 60, y: 50 }
    expect(elbowFrom(start, longEnd, sixPercent, normals, 14).along).not.toBe(0)
  })

  it('leaves a vertex alone, which has no corner to collapse', () => {
    const near = { x: start.x + 2, y: 2 }
    // `bendAt` takes no snapping distance at all: a point the route passes
    // through is wherever it was put.
    expect(bendAt(start, end, near).along).not.toBe(0)
  })
})
