import { describe, expect, it } from 'vitest'

import { clockText, elapsedText, parseClock } from './clock-text.js'

describe('a countdown, as read', () => {
  it('shows minutes and seconds, rounding up so it reads 0:00 only when it is over', () => {
    expect(clockText(5 * 60_000)).toBe('5:00')
    expect(clockText(299_001)).toBe('5:00')
    expect(clockText(61_000)).toBe('1:01')
    expect(clockText(1)).toBe('0:01')
    expect(clockText(0)).toBe('0:00')
  })

  it('shows hours past the hour', () => {
    expect(clockText(3_600_000 + 65_000)).toBe('1:01:05')
  })
})

describe('a duration, as typed', () => {
  it.each([
    ['5', 5 * 60_000],
    ['1:30', 90_000],
    ['0:03', 3000],
    ['1:02:03', 3_723_000],
    [' 10 ', 600_000],
  ])('reads %s', (typed, ms) => {
    expect(parseClock(typed)).toBe(ms)
  })

  it.each(['', 'soon', '1:60', '-2', '1::2', '1:2:3:4'])('refuses %s', (typed) => {
    expect(parseClock(typed)).toBeNull()
  })
})

/*
 * Time INTO something rounds the other way: twelve and a half seconds into a
 * track is 0:12, and it reads 0:13 only once the thirteenth has been heard.
 */
describe('time into a track, as read', () => {
  it('rounds down', () => {
    expect(elapsedText(12_999)).toBe('0:12')
    expect(elapsedText(0)).toBe('0:00')
    expect(elapsedText(3_600_000 + 1500)).toBe('1:00:01')
  })
})
