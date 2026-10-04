import { POLL_MARK } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { tallyPoll } from './poll-tally.js'

const options = [
  { id: 'o1', label: 'Cats' },
  { id: 'o2', label: 'Dogs' },
]
const mark = (value: string, by: string) => ({ kind: POLL_MARK, value, by })

describe('tallyPoll', () => {
  it('counts each person once per option, and marks mine', () => {
    const tally = tallyPoll(
      [mark('o1', 'g_otter'), mark('o1', 'g_otter'), mark('o1', 'g_heron'), mark('o2', 'g_heron')],
      options,
      'g_otter',
    )
    expect(tally.options).toEqual([
      { id: 'o1', label: 'Cats', count: 2, mine: true },
      { id: 'o2', label: 'Dogs', count: 1, mine: false },
    ])
    expect(tally.people).toBe(2)
  })

  it('leaves out answers to an option the poll no longer has, and other kinds of mark', () => {
    const tally = tallyPoll(
      [mark('o3', 'g_otter'), { kind: 'reaction', value: 'o1', by: 'g_otter' }],
      options,
      'g_otter',
    )
    expect(tally.options.map((option) => option.count)).toEqual([0, 0])
    expect(tally.people).toBe(0)
  })
})
