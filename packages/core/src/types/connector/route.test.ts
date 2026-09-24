import { describe, expect, it } from 'vitest'

import { distanceToSegment, type Point } from '../../geometry/point.js'
import { bendAnchor, bendFrom, connectorRoute, flattenRoute, NO_BEND } from './route.js'

const start = { x: 0, y: 0 }
const end = { x: 200, y: 100 }

describe('where the handle sits', () => {
  /*
   * The same point for all three, which is NOT a coincidence to assume — an
   * orthogonal route's middle segment is centred there by construction, and
   * the default curve's control points are placed so its own midpoint lands
   * there too. A handle that started anywhere else would jump on first touch.
   */
  it('starts at the middle of the drawn route, whatever the routing', () => {
    for (const routing of ['straight', 'orthogonal', 'curved'] as const) {
      expect(bendAnchor(start, end, routing, null)).toEqual({ x: 100, y: 50 })
    }
  })

  it('puts the default curve through its own handle', () => {
    const points = flattenRoute(connectorRoute(start, end, 'curved', null), 2)
    // The sampled midpoint of the untouched curve.
    expect(points[1]).toEqual({ x: 100, y: 50 })
  })
})

describe('describing a bend from a dropped point', () => {
  it('round-trips through the anchor', () => {
    for (const routing of ['orthogonal', 'curved'] as const) {
      const at = { x: 150, y: 20 }
      const bend = bendFrom(start, end, routing, at)
      const back = bendAnchor(start, end, routing, bend)
      if (routing === 'curved') {
        expect(back.x).toBeCloseTo(at.x, 6)
        expect(back.y).toBeCloseTo(at.y, 6)
      } else {
        // An orthogonal elbow only moves along the run, so the other axis is
        // not a round trip — it snaps back to the middle segment.
        expect(back.x).toBeCloseTo(at.x, 6)
        expect(back.y).toBeCloseTo(50, 6)
      }
    }
  })

  it('reads the middle as no offset at all', () => {
    const bend = bendFrom(start, end, 'curved', { x: 100, y: 50 })
    expect(bend.along).toBeCloseTo(0.5, 6)
    expect(bend.across).toBeCloseTo(0, 6)
  })

  it('survives two ends in the same place', () => {
    expect(bendFrom(start, start, 'curved', { x: 5, y: 5 })).toEqual(NO_BEND)
    expect(bendFrom(start, start, 'orthogonal', { x: 5, y: 5 })).toEqual(NO_BEND)
  })
})

describe('the route itself', () => {
  it('turns at the halfway point when nothing says otherwise', () => {
    const route = connectorRoute(start, end, 'orthogonal', null)
    expect(route.points).toEqual([start, { x: 100, y: 0 }, { x: 100, y: 100 }, end])
  })

  it('moves the elbow where the bend says', () => {
    const route = connectorRoute(start, end, 'orthogonal', { along: 0.25, across: 0 })
    expect(route.points).toEqual([start, { x: 50, y: 0 }, { x: 50, y: 100 }, end])
  })

  /*
   * The curve must pass through the handle EXACTLY, or the line slides out
   * from under the pointer as you drag it — the failure that makes a control
   * feel broken even though it is doing something.
   */
  it('puts the bent curve through the handle', () => {
    const bend = { along: 0.5, across: 60 }
    const target = bendAnchor(start, end, 'curved', bend)
    const points = flattenRoute(connectorRoute(start, end, 'curved', bend), 2)
    expect(points[1]?.x).toBeCloseTo(target.x, 6)
    expect(points[1]?.y).toBeCloseTo(target.y, 6)
  })

  it('keeps the ends where they were, however hard it is bent', () => {
    for (const routing of ['orthogonal', 'curved'] as const) {
      const points = connectorRoute(start, end, routing, { along: 2.5, across: -300 }).points
      expect(points[0]).toEqual(start)
      expect(points[points.length - 1]).toEqual(end)
    }
  })

  it('leaves a straight route straight, because it has nothing to bend', () => {
    const route = connectorRoute(start, end, 'straight', { along: 0.2, across: 90 })
    expect(route.points).toEqual([start, end])
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
    const route = connectorRoute(start, end, 'curved', null, { start: down, end: null })
    if (route.kind !== 'cubic') throw new Error('a curve is a cubic')
    const [from, control] = route.points
    // The tangent at t=0 is the first control point minus the start.
    expect(control.x).toBeCloseTo(from.x, 6)
    expect(control.y).toBeGreaterThan(from.y)
  })

  it('arrives along the far edge, so the arrowhead points into it', () => {
    const route = connectorRoute(start, end, 'curved', null, { start: null, end: up })
    if (route.kind !== 'cubic') throw new Error('a curve is a cubic')
    const [, , control, to] = route.points
    // The tangent at t=1 is the end minus the last control point: the line
    // arrives travelling DOWNWARD into an end whose outward normal is up.
    expect(control.x).toBeCloseTo(to.x, 6)
    expect(control.y).toBeLessThan(to.y)
  })

  it('keeps the old shape for an end attached to nothing', () => {
    const free = connectorRoute(start, end, 'curved', null, { start: null, end: null })
    const none = connectorRoute(start, end, 'curved', null)
    expect(free).toEqual(none)
  })

  it('runs an orthogonal route out of the edge before it turns', () => {
    const route = connectorRoute(start, end, 'orthogonal', null, { start: down, end: null })
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
    const route = connectorRoute({ x: 200, y: 0 }, { x: 0, y: 100 }, 'orthogonal', null, {
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
    const route = connectorRoute({ x: 0, y: 0 }, { x: 200, y: 0 }, 'orthogonal', null, {
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
      const handle = bendAnchor(start, end, routing, null, normals)
      const drawn = flattenRoute(connectorRoute(start, end, routing, null, normals), 48)
      // On the line it bends, which is the whole contract: a handle anywhere
      // else jumps the moment it is touched.
      expect(offRoute(handle, drawn)).toBeLessThan(0.5)
      // And not simply the straight midpoint, or this would pass with the
      // normals ignored entirely.
      expect(offRoute({ x: 100, y: 50 }, drawn)).toBeGreaterThan(1)
    },
  )

  it('round-trips a dropped point through the bend, with normals', () => {
    const at = { x: 150, y: 20 }
    const bend = bendFrom(start, end, 'curved', at, normals)
    const back = bendAnchor(start, end, 'curved', bend, normals)
    expect(back.x).toBeCloseTo(at.x, 6)
    expect(back.y).toBeCloseTo(at.y, 6)
  })

  it('puts the bent curve through the handle it was bent to', () => {
    const bend = bendFrom(start, end, 'curved', { x: 150, y: 20 }, normals)
    const target = bendAnchor(start, end, 'curved', bend, normals)
    const points = flattenRoute(connectorRoute(start, end, 'curved', bend, normals), 2)
    const sampled = points[1]
    if (sampled === undefined) throw new Error('a sampled midpoint')
    expect(sampled.x).toBeCloseTo(target.x, 6)
    expect(sampled.y).toBeCloseTo(target.y, 6)
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
  const elbowOf = (bend: ReturnType<typeof bendFrom>): number =>
    bendAnchor(start, end, 'orthogonal', bend, normals).x

  it('takes the L when the elbow is dropped near one end', () => {
    const near = { x: start.x + 6, y: 50 }
    expect(bendFrom(start, end, 'orthogonal', near, normals, 14).along).toBe(0)

    const far = { x: end.x - 6, y: 50 }
    expect(bendFrom(start, end, 'orthogonal', far, normals, 14).along).toBe(1)
  })

  it('leaves the elbow where it was put when nothing is near', () => {
    const middle = { x: 100, y: 50 }
    const bend = bendFrom(start, end, 'orthogonal', middle, normals, 14)
    expect(bend.along).toBeCloseTo(0.5, 1)
    expect(elbowOf(bend)).toBeCloseTo(100, 6)
  })

  it('never snaps when the caller asks for none', () => {
    const near = { x: start.x + 6, y: 50 }
    expect(bendFrom(start, end, 'orthogonal', near, normals, 0).along).not.toBe(0)
  })

  /**
   * The release is the same call with a bigger number, which is the whole
   * reason the distance is a parameter: a drag that has already taken the L
   * asks for a wider one, so the shape does not flicker while a hand hovers
   * at the threshold.
   */
  it('holds the L further out than it took it', () => {
    const at = { x: start.x + 20, y: 50 }
    expect(bendFrom(start, end, 'orthogonal', at, normals, 14).along).not.toBe(0)
    expect(bendFrom(start, end, 'orthogonal', at, normals, 28).along).toBe(0)
  })

  it('measures in world units, not as a fraction of the run', () => {
    const longEnd = { x: 1000, y: 100 }
    // The same six units from the start snaps on a long run as on a short one.
    expect(bendFrom(start, longEnd, 'orthogonal', { x: 6, y: 50 }, normals, 14).along).toBe(0)

    /*
     * And the case the two rules DISAGREE about, which is the only one worth
     * asserting: sixty units out is 6% of this run. A fraction-based snap of
     * any usable size would take it; fourteen world units does not. A test
     * that only used points near the very start would pass either way — and
     * the first version of this one did.
     */
    const sixPercent = { x: 60, y: 50 }
    expect(bendFrom(start, longEnd, 'orthogonal', sixPercent, normals, 14).along).not.toBe(0)
  })

  it('leaves a curve alone, which has no corner to collapse', () => {
    const near = { x: start.x + 2, y: 2 }
    expect(bendFrom(start, end, 'curved', near, normals, 14).along).not.toBe(0)
  })
})
