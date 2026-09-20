import { describe, expect, it } from 'vitest'

import { rect } from '@openframe/core'

import {
  CONNECT_OUTSET_PX,
  CONNECT_REACH_PX,
  CONNECT_TARGET_PX,
  PANEL_CLEARANCE_PX,
  SIDES,
  connectPointAt,
  edgeMidpoint,
} from './connect-points.js'
import { HANDLE_HIT_PX, ROTATE_OFFSET_PX } from './resize.js'

const BOX = rect(100, 100, 200, 120)

describe('where a connection point sits', () => {
  it('is outside the object on every side', () => {
    expect(connectPointAt(BOX, 'top', 10)).toEqual({ x: 200, y: 90 })
    expect(connectPointAt(BOX, 'bottom', 10)).toEqual({ x: 200, y: 230 })
    expect(connectPointAt(BOX, 'left', 10)).toEqual({ x: 90, y: 160 })
    expect(connectPointAt(BOX, 'right', 10)).toEqual({ x: 310, y: 160 })
  })

  /**
   * The bug this module exists for, on every side.
   *
   * Both controls have a 24px target, so clearing one another takes the SUM of
   * their halves — not half of one. Asserting against only the resize handle's
   * half is what let the first fix ship an overlap it had already been written
   * to prevent.
   */
  it('clears the resize handle it used to sit underneath, on every side', () => {
    for (const side of SIDES) {
      const at = connectPointAt(BOX, side, CONNECT_OUTSET_PX)
      const edge = edgeMidpoint(BOX, side)
      const gap = Math.hypot(at.x - edge.x, at.y - edge.y)
      expect(gap, side).toBeGreaterThan(HANDLE_HIT_PX / 2 + CONNECT_TARGET_PX / 2)
    }
  })

  it('attaches at the edge even though it is drawn away from it', () => {
    // Where a connector JOINS is the edge; the outset is presentation only.
    expect(edgeMidpoint(BOX, 'right')).toEqual({ x: 300, y: 160 })
  })
})

/**
 * Three pieces of chrome share the top edge: the `n` resize handle ON it, the
 * connection point outside it, and the rotate grip beyond that. Each has a
 * 24px pointer target, so their distances are one relationship rather than
 * three independent numbers.
 *
 * This suite exists because fixing the first collision caused the second.
 * Moving the connection points off the resize handles put them directly under
 * the rotate grip, and a shape could not be rotated at all — the sort of trade
 * that looks like progress until somebody tries the other gesture.
 */
describe('the chrome around a selected object does not overlap itself', () => {
  const reach = (centre: number, target: number) => ({
    from: centre - target / 2,
    to: centre + target / 2,
  })

  it('keeps the rotate grip clear of the connection point', () => {
    const connect = reach(CONNECT_OUTSET_PX, CONNECT_TARGET_PX)
    const rotate = reach(ROTATE_OFFSET_PX, HANDLE_HIT_PX)

    expect(rotate.from).toBeGreaterThan(connect.to)
  })

  it('keeps the connection point clear of the resize handle on the edge', () => {
    const connect = reach(CONNECT_OUTSET_PX, CONNECT_TARGET_PX)
    // The `n` handle is centred ON the edge, at zero.
    const resize = reach(0, HANDLE_HIT_PX)

    expect(connect.from).toBeGreaterThan(resize.to)
  })
})

/**
 * And a panel floating beside the selection clears the chrome too.
 *
 * The inspector sat 14px from the edge, which was fine while the connection
 * points were ON the edge and covered them the moment they moved outside it.
 * A panel over a control is a control that cannot be pressed — and it was the
 * connector test, not the inspector's, that noticed.
 */
describe('a floating panel clears the chrome', () => {
  it('stays further out than the connection point reaches', () => {
    expect(PANEL_CLEARANCE_PX).toBeGreaterThan(CONNECT_REACH_PX)
  })
})
