import { afterEach, describe, expect, it, vi } from 'vitest'

import { readSeen, writeSeen } from './agent-seen.js'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('the agent changes this browser has seen', () => {
  it('are remembered per board', () => {
    writeSeen('brd_a', new Set(['c1', 'c2']))
    expect([...readSeen('brd_a')]).toEqual(['c1', 'c2'])
    expect(readSeen('brd_b').size).toBe(0)
  })

  it('keep only the latest, as the log does', () => {
    writeSeen('brd_a', new Set(Array.from({ length: 250 }, (_, i) => `c${String(i)}`)))
    const seen = readSeen('brd_a')
    expect(seen.size).toBe(200)
    expect(seen.has('c249')).toBe(true)
    expect(seen.has('c0')).toBe(false)
  })

  it('leave a change new rather than fail when storage refuses or holds rubbish', () => {
    localStorage.setItem('openframe:agent-seen:brd_a', '{not json')
    expect(readSeen('brd_a').size).toBe(0)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => {
      writeSeen('brd_a', new Set(['c1']))
    }).not.toThrow()
  })
})
