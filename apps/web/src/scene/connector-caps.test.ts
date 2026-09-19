import { ARROWHEADS, type Point } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { capPath } from './connector-caps.js'

/**
 * Cap geometry, checked without rendering.
 *
 * A cap is drawn at an arbitrary angle, and an error in the trigonometry is a
 * shape that is subtly wrong at every angle except the one it was eyeballed
 * at. These assert the properties that hold whichever way the line runs.
 */
const TIP: Point = { x: 100, y: 100 }

/** Every coordinate in a path, as numbers. */
function coordinates(d: string): number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
}

describe('what a connector wears at its end', () => {
  it('wears nothing when it wears none', () => {
    expect(capPath('none', TIP, 0)).toBeNull()
  })

  it('has a shape for every kind the schema allows', () => {
    for (const kind of ARROWHEADS) {
      if (kind === 'none') continue
      const cap = capPath(kind, TIP, 0)
      expect(cap, `${kind} has no path`).not.toBeNull()
      expect(cap?.d.length ?? 0, `${kind} has an empty path`).toBeGreaterThan(0)
    }
  })

  /**
   * An endpoint attached to an object resolves to that object's boundary, so a
   * cap centred on the tip would bury half of itself in the thing it points
   * at. `bar` is the deliberate exception — one that did not straddle would
   * just be a shorter line.
   */
  it('sits behind the tip rather than straddling it', () => {
    const travellingRight = 0
    for (const kind of ARROWHEADS) {
      if (kind === 'none' || kind === 'bar' || kind === 'semicircle') continue
      const cap = capPath(kind, TIP, travellingRight)
      const xs = coordinates(cap?.d ?? '').filter((_, index) => index % 2 === 0)
      // Nothing reaches past the tip, give or take a rounded coordinate.
      expect(Math.max(...xs), `${kind} overshoots the tip`).toBeLessThanOrEqual(TIP.x + 0.01)
    }
  })

  /** A closed area is filled; an open outline is stroked. Never both. */
  it('knows which of its shapes are areas and which are outlines', () => {
    expect(capPath('triangle', TIP, 0)?.filled).toBe(true)
    expect(capPath('diamond', TIP, 0)?.filled).toBe(true)
    expect(capPath('dot', TIP, 0)?.filled).toBe(true)
    expect(capPath('arrow', TIP, 0)?.filled).toBe(false)
    expect(capPath('semicircle', TIP, 0)?.filled).toBe(false)
    expect(capPath('bar', TIP, 0)?.filled).toBe(false)
  })

  /**
   * The same cap at the same tip, pointing the other way, must be the mirror
   * of itself — not the same path. A cap that ignored its rotation would pass
   * every test above and point the wrong way on half the board.
   */
  it('turns with the line', () => {
    for (const kind of ARROWHEADS) {
      if (kind === 'none') continue
      const right = capPath(kind, TIP, 0)
      const left = capPath(kind, TIP, Math.PI)
      expect(right?.d, `${kind} does not turn`).not.toBe(left?.d)
    }
  })

  it('produces no NaN at any angle', () => {
    for (const kind of ARROWHEADS) {
      if (kind === 'none') continue
      for (let turn = 0; turn < 12; turn++) {
        const cap = capPath(kind, TIP, (turn * Math.PI) / 6)
        for (const value of coordinates(cap?.d ?? '')) {
          expect(Number.isFinite(value), `${kind} at turn ${String(turn)}`).toBe(true)
        }
      }
    }
  })
})
