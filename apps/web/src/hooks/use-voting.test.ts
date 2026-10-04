import { asObjectId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { countsShown, rankVotes, tallyVoters, topPlaces } from './use-voting.js'

const a = asObjectId('a')
const b = asObjectId('b')
const c = asObjectId('c')
const d = asObjectId('d')

describe('tallyVoters', () => {
  it('counts every dot in the round, and which are mine', () => {
    const voters = 'vr_1\tg_heron\nvr_1\tg_otter\nvr_1\tg_otter'
    expect(tallyVoters(voters, 'vr_1', 'g_otter')).toEqual({ total: 3, mine: 2 })
    expect(tallyVoters('', 'vr_1', 'g_otter')).toEqual({ total: 0, mine: 0 })
    expect(tallyVoters('vr_1\tg_heron', 'vr_1', null)).toEqual({ total: 1, mine: 0 })
  })

  it('leaves out a dot from any other round, which a merge can leave behind', () => {
    expect(tallyVoters('vr_1\tg_heron\nvr_2\tg_otter', 'vr_2', 'g_otter')).toEqual({
      total: 1,
      mine: 1,
    })
  })
})

describe('countsShown', () => {
  const round = {
    title: '',
    scope: { kind: 'board' as const },
    perPerson: 3,
    run: 1,
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
    // Board order is what is passed, never the ids' own order.
    expect(rankVotes(counts, [c, a, b, d]).map((entry) => entry.id)).toEqual([b, c, a])
  })
  it('takes everything tied with the last place', () => {
    const ranked = rankVotes(counts, [a, b, c, d])
    expect(topPlaces(ranked, 2)).toEqual([b, a, c])
    expect(topPlaces(ranked, 1)).toEqual([b])
    expect(topPlaces(ranked, 5)).toEqual([b, a, c])
  })
})
