import { describe, expect, it } from 'vitest'

import { CLOCK_SAMPLES, ServerClock } from './clock.js'

/**
 * How far this device's clock is from the room's.
 *
 * Each sample is one round trip: asked at `sentAt`, answered with the room's
 * time, heard at `receivedAt`. The room's answer was true somewhere in
 * between, so the best guess puts it in the middle — and the shorter the trip,
 * the less "somewhere" there is to be wrong about.
 */
describe('the room clock', () => {
  it('knows nothing before it has asked, and says so', () => {
    const clock = new ServerClock()
    expect(clock.synced).toBe(false)
    expect(clock.offset).toBe(0)
  })

  it('puts the room’s answer half way through the round trip', () => {
    const clock = new ServerClock()
    expect(clock.add(1000, 6050, 1100)).toBe(true)
    expect(clock.synced).toBe(true)
    expect(clock.offset).toBe(5000)
  })

  it('believes the quickest round trip, not the latest', () => {
    const clock = new ServerClock()
    clock.add(1000, 6010, 1020) // 20ms trip: offset 5000
    clock.add(2000, 9000, 2900) // 900ms trip, queued behind something: offset 6550
    expect(clock.offset).toBe(5000)
  })

  it('forgets a trip once enough newer ones have come in', () => {
    const clock = new ServerClock()
    clock.add(0, 5005, 10) // the quickest ever, offset 5000
    for (let index = 1; index <= CLOCK_SAMPLES; index += 1) {
      const sentAt = index * 1000
      clock.add(sentAt, sentAt + 7050, sentAt + 100) // offset 7000
    }
    // A clock that drifted, or a device that slept, is followed — not held to an old trip.
    expect(clock.offset).toBe(7000)
  })

  it('ignores a trip that went backwards or is not a number', () => {
    const clock = new ServerClock()
    expect(clock.add(1000, 5000, 900)).toBe(false)
    expect(clock.add(Number.NaN, 5000, 1000)).toBe(false)
    expect(clock.add(1000, Number.POSITIVE_INFINITY, 1100)).toBe(false)
    expect(clock.synced).toBe(false)
  })
})
