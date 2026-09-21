import { describe, expect, it } from 'vitest'

import { alignOffsets, distributeOffsets, type Arrangeable } from './arrange.js'

const at = (id: string, x: number, y: number, width = 10, height = 10): Arrangeable<string> => ({
  id,
  bounds: { x, y, width, height },
})

/** Where each item ends up, which is what anyone actually looks at. */
interface Span {
  readonly x: number
  readonly y: number
  readonly right: number
  readonly bottom: number
}

function applied(
  items: readonly Arrangeable<string>[],
  offsets: readonly { id: string; dx: number; dy: number }[],
): (id: string) => Span {
  const byId = new Map(offsets.map((offset) => [offset.id, offset]))
  const spans = new Map<string, Span>(
    items.map((item) => {
      const move = byId.get(item.id) ?? { dx: 0, dy: 0 }
      const x = item.bounds.x + move.dx
      const y = item.bounds.y + move.dy
      return [item.id, { x, y, right: x + item.bounds.width, bottom: y + item.bounds.height }]
    }),
  )
  return (id) => {
    const span = spans.get(id)
    if (span === undefined) throw new Error(`no such item: ${id}`)
    return span
  }
}

describe('aligning', () => {
  const items = [at('a', 0, 0, 10, 10), at('b', 30, 50, 40, 20)]

  it('puts every left edge on the leftmost one', () => {
    const after = applied(items, alignOffsets(items, 'left'))
    expect(after('a').x).toBe(0)
    expect(after('b').x).toBe(0)
  })

  it('puts every right edge on the rightmost one', () => {
    const after = applied(items, alignOffsets(items, 'right'))
    expect(after('a').right).toBe(70)
    expect(after('b').right).toBe(70)
  })

  /*
   * Centres, NOT left edges — which is the difference a test using
   * same-sized objects cannot see, because for those the two agree. The
   * rectangles above are deliberately different sizes for that reason.
   */
  it('puts every horizontal centre on the selection centre', () => {
    const after = applied(items, alignOffsets(items, 'centerX'))
    expect((after('a').x + after('a').right) / 2).toBe(35)
    expect((after('b').x + after('b').right) / 2).toBe(35)
  })

  it('aligns top, middle and bottom on the other axis', () => {
    expect(applied(items, alignOffsets(items, 'top'))('b').y).toBe(0)
    expect(applied(items, alignOffsets(items, 'bottom'))('a').bottom).toBe(70)
    const middle = applied(items, alignOffsets(items, 'middleY'))
    expect((middle('a').y + middle('a').bottom) / 2).toBe(35)
    expect((middle('b').y + middle('b').bottom) / 2).toBe(35)
  })

  it('moves nothing on the axis it is not aligning', () => {
    for (const offset of alignOffsets(items, 'left')) expect(offset.dy).toBe(0)
    for (const offset of alignOffsets(items, 'top')) expect(offset.dx).toBe(0)
  })

  it('has nothing to say about fewer than two things', () => {
    expect(alignOffsets([at('a', 0, 0)], 'left')).toEqual([])
    expect(alignOffsets([], 'left')).toEqual([])
  })
})

describe('distributing', () => {
  /*
   * DIFFERENT SIZES on purpose, and the OUTER TWO differ from each other.
   *
   * Equal gaps and equal centres give the same answer for equally sized
   * objects, so a suite built on those cannot tell which one is implemented.
   * The first version of this varied only the middle one — and the two
   * answers still agree, because the middle object's width cancels out of the
   * centre-to-centre distance. It took a failing assertion to notice.
   */
  const items = [at('a', 0, 0, 10, 10), at('b', 20, 0, 40, 10), at('c', 100, 0, 30, 10)]

  it('leaves the outermost two exactly where they were', () => {
    const after = applied(items, distributeOffsets(items, 'x'))
    expect(after('a').x).toBe(0)
    expect(after('c').x).toBe(100)
  })

  it('makes the gaps equal, not the centres', () => {
    const after = applied(items, distributeOffsets(items, 'x'))
    const gapBefore = after('b').x - after('a').right
    const gapAfter = after('c').x - after('b').right
    expect(gapBefore).toBeCloseTo(gapAfter, 6)
    // 130 of span less 80 of object, over two gaps.
    expect(gapBefore).toBeCloseTo(25, 6)
    // And the centres are NOT evenly spaced, which is the point.
    const centre = (id: string): number => (after(id).x + after(id).right) / 2
    expect(centre('b') - centre('a')).not.toBeCloseTo(centre('c') - centre('b'), 6)
  })

  it('works from whatever order the selection happens to be in', () => {
    const shuffled = [items[2]!, items[0]!, items[1]!]
    const fromShuffled = applied(shuffled, distributeOffsets(shuffled, 'x'))
    const fromOrdered = applied(items, distributeOffsets(items, 'x'))
    for (const id of ['a', 'b', 'c']) expect(fromShuffled(id)).toEqual(fromOrdered(id))
  })

  it('distributes down the other axis too', () => {
    const column = [at('a', 0, 0, 10, 10), at('b', 0, 20, 10, 40), at('c', 0, 100, 10, 10)]
    const after = applied(column, distributeOffsets(column, 'y'))
    expect(after('b').y - after('a').bottom).toBeCloseTo(after('c').y - after('b').bottom, 6)
    for (const offset of distributeOffsets(column, 'y')) expect(offset.dx).toBe(0)
  })

  it('evens out an overlapping stack rather than refusing it', () => {
    const stack = [at('a', 0, 0, 40, 10), at('b', 5, 0, 40, 10), at('c', 10, 0, 40, 10)]
    const after = applied(stack, distributeOffsets(stack, 'x'))
    expect(after('b').x - after('a').x).toBeCloseTo(after('c').x - after('b').x, 6)
  })

  it('has nothing between the ends with fewer than three', () => {
    expect(distributeOffsets([at('a', 0, 0), at('b', 50, 0)], 'x')).toEqual([])
  })
})
