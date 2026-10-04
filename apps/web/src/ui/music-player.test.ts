import { afterEach, describe, expect, it, vi } from 'vitest'

import { DRIFT_MS, readListening, shouldSeek, writeListening } from './music-player.js'

/**
 * Playing the session's music where everybody else is (ADR 0017).
 *
 * A device seeks only when it has drifted noticeably: seeking for every few
 * milliseconds of jitter would stutter, and never seeking would let a device
 * that buffered for a second stay a second behind for the rest of the track.
 */
describe('keeping up with the room', () => {
  it('leaves a device that is close enough alone', () => {
    expect(shouldSeek(10.2, 10_000)).toBe(false)
    expect(shouldSeek(10, 10_000 + DRIFT_MS - 1)).toBe(false)
  })

  it('moves a device that has fallen behind, or run ahead', () => {
    expect(shouldSeek(9, 10_000)).toBe(true)
    expect(shouldSeek(11, 10_000)).toBe(true)
  })
})

/*
 * Mute and volume are this device's business, not the room's — somebody in a
 * library turns their own sound off without turning off anyone else's.
 */
describe('this device’s sound', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('starts audible at a moderate volume', () => {
    expect(readListening()).toEqual({ muted: false, volume: 0.6 })
  })

  it('is remembered across a reload', () => {
    writeListening({ muted: true, volume: 0.25 })
    expect(readListening()).toEqual({ muted: true, volume: 0.25 })
  })

  it('reads nothing it cannot use', () => {
    localStorage.setItem('openframe:music-sound', '{"muted":"yes","volume":7}')
    expect(readListening()).toEqual({ muted: false, volume: 0.6 })
  })

  it('carries on when storage is refused', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => {
      writeListening({ muted: true, volume: 0.1 })
    }).not.toThrow()
  })
})
