import { describe, expect, it } from 'vitest'

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
