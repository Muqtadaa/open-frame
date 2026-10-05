import { describe, expect, it } from 'vitest'

import { dayOf, refundRun, reserveRun } from './quota.js'

const limits = { person: 2, everyone: 3 }
const day = dayOf(Date.UTC(2026, 9, 5, 12))

describe('daily AI runs', () => {
  it('counts per person and stops each at their limit', () => {
    let counts = reserveRun(undefined, day, 'a', limits)
    expect(counts.result).toEqual({ ok: true, remaining: 1 })
    counts = reserveRun(counts.counts, day, 'a', limits)
    expect(counts.result).toEqual({ ok: true, remaining: 0 })
    expect(reserveRun(counts.counts, day, 'a', limits).result).toEqual({
      ok: false,
      limit: 'person',
    })
  })

  it('stops everybody at the global limit', () => {
    let counts = reserveRun(undefined, day, 'a', limits).counts
    counts = reserveRun(counts, day, 'a', limits).counts
    counts = reserveRun(counts, day, 'b', limits).counts
    expect(reserveRun(counts, day, 'c', limits).result).toEqual({ ok: false, limit: 'everyone' })
  })

  it('starts again the next day', () => {
    let counts = reserveRun(undefined, day, 'a', limits).counts
    counts = reserveRun(counts, day, 'a', limits).counts
    expect(reserveRun(counts, '2026-10-06', 'a', limits).result).toEqual({
      ok: true,
      remaining: 1,
    })
  })

  it('gives a run back, never below zero and never to another day', () => {
    const taken = reserveRun(undefined, day, 'a', limits).counts
    const back = refundRun(taken, day, 'a')
    expect(back.people.a).toBe(0)
    expect(back.everyone).toBe(0)
    expect(refundRun(back, day, 'a')).toEqual(back)
    expect(refundRun(taken, '2026-10-06', 'a')).toEqual(taken)
  })
})
