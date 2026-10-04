import { asObjectId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { countsShown, rankVotes, tallyVoters, topPlaces } from './use-voting.js'

const a = asObjectId('a')
const b = asObjectId('b')
const c = asObjectId('c')
const d = asObjectId('d')

describe('tallyVoters', () => {
  it('counts every dot, and which are mine', () => {
    expect(tallyVoters('g_heron\ng_otter\ng_otter', 'g_otter')).toEqual({ total: 3, mine: 2 })
    expect(tallyVoters('', 'g_otter')).toEqual({ total: 0, mine: 0 })
    expect(tallyVoters('g_heron', null)).toEqual({ total: 1, mine: 0 })
  })
})

describe('countsShown', () => {
  const round = {
    title: '',
    scope: { kind: 'board' as const },
    perPerson: 3,
    by: { key: 'g_otter', name: 'Otter', hue: 0 },
  }
  it('hides counts only while a hidden round is open', () => {
    expect(countsShown({ ...round, hidden: true, status: 'open' })).toBe(false)
    expect(countsShown({ ...round, hidden: true, status: 'closed' })).toBe(true)
    expect(countsShown({ ...round, hidden: false, status: 'open' })).toBe(true)
  })
})

describe('ranking', () => {
  const counts = new Map([
    [a, 1],
    [b, 3],
    [c, 1],
    [d, 0],
  ])
  it('ranks by count, ties in board order, and leaves out notes with none', () => {
    expect(rankVotes(counts, [c, a, b, d]).map((entry) => entry.id)).toEqual([b, c, a])
  })
  it('takes everything tied with the last place', () => {
    const ranked = rankVotes(counts, [a, b, c, d])
    expect(topPlaces(ranked, 2)).toEqual([b, a, c])
    expect(topPlaces(ranked, 1)).toEqual([b])
    expect(topPlaces(ranked, 5)).toEqual([b, a, c])
  })
})
