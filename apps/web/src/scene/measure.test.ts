import type { Rect } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { distancesBetween, gapsWithin, matchesBetween, nearestDistances } from './measure.js'

/**
 * Measuring on purpose: hold Alt with something selected and point at
 * something else, as in a design tool. The board said how far apart two things
 * were only while one was being dragged into line with the other.
 */
const rect = (x: number, y: number, width = 100, height = 50): Rect => ({ x, y, width, height })

describe('the distance between two things', () => {
  it('is one line across the gap when they sit side by side', () => {
    // b is 60 to the right, overlapping a vertically from 20 to 50.
    expect(distancesBetween(rect(0, 0), rect(160, 20))).toEqual([
      { axis: 'x', from: 100, to: 160, at: 35 },
    ])
  })

  it('is one line down the gap when one is above the other', () => {
    expect(distancesBetween(rect(0, 0), rect(40, 90))).toEqual([
      { axis: 'y', from: 50, to: 90, at: 70 },
    ])
  })

  /*
   * Apart on both axes, the two lines are one L from corner to corner: across
   * along the selection's near edge, then down the target's. Drawn from each
   * one's middle they were two spokes in empty space that met nowhere.
   */
  it('is an L from corner to corner when they are apart on both', () => {
    // Selection's bottom-right corner (100, 50); target's top-left (200, 120).
    expect(distancesBetween(rect(0, 0), rect(200, 120))).toEqual([
      { axis: 'x', from: 100, to: 200, at: 50 },
      { axis: 'y', from: 50, to: 120, at: 200 },
    ])
  })

  it('turns the L the other way when the target is above and to the left', () => {
    // Selection's top-left corner (300, 200); target's bottom-right (100, 50).
    expect(distancesBetween(rect(300, 200), rect(0, 0))).toEqual([
      { axis: 'x', from: 100, to: 300, at: 200 },
      { axis: 'y', from: 50, to: 200, at: 100 },
    ])
  })

  it('works from the other side too', () => {
    expect(distancesBetween(rect(300, 0), rect(100, 10))).toEqual([
      { axis: 'x', from: 200, to: 300, at: 30 },
    ])
  })

  it('is four lines, edge to edge, when one is inside the other', () => {
    const inner = rect(20, 10, 60, 30)
    const outer = rect(0, 0, 100, 50)
    expect(distancesBetween(inner, outer)).toEqual([
      { axis: 'x', from: 0, to: 20, at: 25 },
      { axis: 'x', from: 80, to: 100, at: 25 },
      { axis: 'y', from: 0, to: 10, at: 50 },
      { axis: 'y', from: 40, to: 50, at: 50 },
    ])
    // Whichever is selected, the lines are drawn about the one inside.
    expect(distancesBetween(outer, inner)).toEqual(distancesBetween(inner, outer))
  })

  it('says nothing about an axis they overlap on without one holding the other', () => {
    expect(distancesBetween(rect(0, 0), rect(50, 20))).toEqual([])
  })
})

describe('what lines up between two things', () => {
  it('finds edges that match, as a line spanning both', () => {
    expect(matchesBetween(rect(0, 0), rect(0, 100))).toEqual([
      { axis: 'x', position: 0, start: 0, end: 150 },
      { axis: 'x', position: 50, start: 0, end: 150 },
      { axis: 'x', position: 100, start: 0, end: 150 },
    ])
  })

  it('finds centres that match even when the edges do not', () => {
    expect(matchesBetween(rect(0, 0, 100, 50), rect(200, -25, 40, 100))).toEqual([
      { axis: 'y', position: 25, start: 0, end: 240 },
    ])
  })

  it('finds nothing that is merely close', () => {
    expect(matchesBetween(rect(0, 0), rect(3, 200))).toEqual([])
  })
})

describe('the gaps inside a selection', () => {
  it('measures between neighbours in a row, and only between neighbours', () => {
    const row = [rect(260, 0), rect(0, 0), rect(130, 0)]
    expect(gapsWithin(row)).toEqual([
      { axis: 'x', from: 100, to: 130, at: 25 },
      { axis: 'x', from: 230, to: 260, at: 25 },
    ])
  })

  it('measures down a column', () => {
    expect(gapsWithin([rect(0, 0), rect(0, 80)])).toEqual([{ axis: 'y', from: 50, to: 80, at: 50 }])
  })

  /*
   * A wide thing and a narrow one inside its stretch: the next neighbour's gap
   * is from the WIDE one's end, or the line is drawn straight through it.
   */
  it('measures from the furthest reach so far, not from the last one to start', () => {
    const spans = [rect(0, 0, 300, 50), rect(100, 0, 10, 50), rect(400, 0, 100, 50)]
    expect(gapsWithin(spans).filter((gap) => gap.axis === 'x')).toEqual([
      { axis: 'x', from: 300, to: 400, at: 25 },
    ])
  })

  /*
   * Neighbours on a diagonal were measured midway between their middles: two
   * short lines crossing in the empty space between them, touching neither.
   */
  it('measures neighbours on a diagonal as the same L as pointing at one', () => {
    const a = rect(0, 0)
    const b = rect(200, 120)
    expect(gapsWithin([b, a])).toEqual(distancesBetween(a, b))
  })

  it('measures nothing between things that overlap', () => {
    expect(gapsWithin([rect(0, 0), rect(50, 20)])).toEqual([])
  })
})

/*
 * Nudging with the arrows says how far the selection is from what is around
 * it, every press — so it can be walked into place a unit at a time.
 */
describe('the distances around a nudged selection', () => {
  it('measures to the nearest neighbour on each side that shares its row or column', () => {
    const selection = rect(200, 200, 100, 50)
    const others = [
      rect(0, 210, 100, 30), // left, in the row
      rect(50, 200, 40, 50), // further left, in the row: not the nearest
      rect(420, 190, 100, 50), // right, in the row
      rect(220, 0, 60, 60), // above, in the column
      rect(600, 600, 50, 50), // off to the side of everything: ignored
    ]
    expect(nearestDistances(selection, others)).toEqual([
      { axis: 'x', from: 100, to: 200, at: 225 },
      { axis: 'x', from: 300, to: 420, at: 220 },
      { axis: 'y', from: 60, to: 200, at: 250 },
    ])
  })

  it('measures nothing on a side with nobody in line', () => {
    expect(nearestDistances(rect(0, 0), [rect(500, 500)])).toEqual([])
  })
})

describe('the gaps inside a selection, with one thing holding another', () => {
  it('measures no gap between a thing and what it holds', () => {
    // Same left edge, with the one inside listed first, so it is the reach
    // when its holder comes next: the room inside is not a gap between them.
    expect(gapsWithin([rect(0, 100, 100, 50), rect(0, 0, 300, 300)])).toEqual([])
  })
})
