import { describe, expect, it } from 'vitest'

import { asOrderKey } from './ids.js'
import {
  compareOrder,
  compareSiblings,
  firstOrder,
  needsRebalance,
  orderBetween,
  ordersBetween,
} from './order.js'

describe('fractional ordering', () => {
  it('produces a key between two neighbours', () => {
    const a = firstOrder()
    const c = orderBetween(a, null)
    const b = orderBetween(a, c)
    expect(compareOrder(a, b)).toBeLessThan(0)
    expect(compareOrder(b, c)).toBeLessThan(0)
  })

  it('appends after the last key', () => {
    let last = firstOrder()
    const keys = [last]
    for (let i = 0; i < 20; i++) {
      last = orderBetween(last, null)
      keys.push(last)
    }
    expect([...keys].sort()).toEqual(keys)
  })

  it('prepends before the first key', () => {
    let first = firstOrder()
    const keys = [first]
    for (let i = 0; i < 20; i++) {
      first = orderBetween(null, first)
      keys.unshift(first)
    }
    expect([...keys].sort()).toEqual(keys)
  })

  it('generates several ordered keys at once', () => {
    const keys = ordersBetween(null, null, 5)
    expect(keys).toHaveLength(5)
    expect([...keys].sort()).toEqual(keys)
  })

  it('returns no keys when none are requested', () => {
    expect(ordersBetween(null, null, 0)).toEqual([])
  })

  /**
   * The degradation this guards against: repeatedly dropping an object between
   * the same two neighbours grows keys without bound — measured at roughly one
   * character per six inserts. We do not prevent it; we detect it, so a
   * rebalance can be scheduled. See docs/appendices/c-risks.md (R5).
   */
  it('detects key growth that warrants a rebalance', () => {
    const low = firstOrder()
    let high = orderBetween(low, null)
    for (let i = 0; i < 250; i++) high = orderBetween(low, high)
    expect(needsRebalance([low, high])).toBe(true)
    expect(needsRebalance([low])).toBe(false)
  })
})

describe('sibling order', () => {
  const at = (order: string, id: string) => ({ order: asOrderKey(order), id })

  it('is by key first', () => {
    expect(compareSiblings(at('a0', 'z'), at('a1', 'a'))).toBeLessThan(0)
  })

  /*
   * Two people adding on top of the same container at once mint the same key,
   * and every client must stack the pair the same way.
   */
  it('breaks a tie by id, so every client agrees', () => {
    expect(compareSiblings(at('a1', 'obj_a'), at('a1', 'obj_b'))).toBeLessThan(0)
    expect(compareSiblings(at('a1', 'obj_b'), at('a1', 'obj_a'))).toBeGreaterThan(0)
    expect(compareSiblings(at('a1', 'obj_a'), at('a1', 'obj_a'))).toBe(0)
  })

  /*
   * Keys run 0-9, A-Z, a-z. Locale order folds case, and so puts `aa` before
   * `aB` — the opposite of what the keys say.
   */
  it('compares code units, where locale order would disagree', () => {
    const keys = ordersBetween(null, null, 40)
    const sorted = [...keys].reverse().map((key, index) => at(key, String(index)))
    sorted.sort(compareSiblings)
    expect(sorted.map((sibling) => sibling.order)).toEqual(keys)
    expect([...keys].sort((a, b) => a.localeCompare(b))).not.toEqual(keys)
  })
})
