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
    clock.add(2000, 7850, 2900) // 900ms trip, queued behind something: offset 5400
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

  /*
   * A device's own clock can jump — a sleep, a correction — and every sample
   * from before then is measuring a clock that no longer exists. Kept, the
   * quickest of them went on winning for up to eight resyncs (Codex, on #63).
   */
  it('lets go of every earlier trip when the device’s clock has jumped', () => {
    const clock = new ServerClock()
    clock.add(0, 5005, 10) // quick, offset 5000
    clock.add(100_000, 165_050, 100_100) // a minute out: this device's clock moved
    expect(clock.offset).toBe(65_000)
  })

  it('keeps the quickest trip when a slower one merely disagrees within its own error', () => {
    const clock = new ServerClock()
    clock.add(0, 5005, 10) // offset 5000, ±5
    clock.add(1000, 6400, 1600) // offset 5100, ±300: consistent with the first
    expect(clock.offset).toBe(5000)
  })
})
