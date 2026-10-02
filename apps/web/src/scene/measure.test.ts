import type { Rect } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { distancesBetween, gapsWithin, matchesBetween } from './measure.js'

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

  it('is a line on each axis when they are apart on both, drawn from the selection', () => {
    expect(distancesBetween(rect(0, 0), rect(200, 120))).toEqual([
      { axis: 'x', from: 100, to: 200, at: 25 },
      { axis: 'y', from: 50, to: 120, at: 50 },
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

  it('measures nothing between things that overlap', () => {
    expect(gapsWithin([rect(0, 0), rect(50, 20)])).toEqual([])
  })
})
