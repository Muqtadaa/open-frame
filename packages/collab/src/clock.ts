/**
 * How far this device's clock is from the room's (ADR 0017).
 *
 * The NTP idea at its smallest. Each sample is one round trip: asked at
 * `sentAt`, answered with the room's time, heard at `receivedAt`, all but the
 * answer on this device's clock. The answer was true somewhere inside the trip,
 * so the guess puts it in the middle, and the error is at most half the trip —
 * which is why the QUICKEST of the recent trips is the one believed. A trip
 * that sat behind a large board arriving says little about the clocks.
 *
 * Only the last few are kept, so a device that slept or a clock that was
 * corrected is followed rather than held to an old, quick trip forever.
 */

export const CLOCK_SAMPLES = 8

interface Sample {
  readonly offset: number
  readonly trip: number
}

export class ServerClock {
  #samples: Sample[] = []

  /** Whether the room has answered at all. Until it has, the offset is zero: this device's own clock. */
  get synced(): boolean {
    return this.#samples.length > 0
  }

  /** Add this to the device's clock to read the room's. */
  get offset(): number {
    let best: Sample | null = null
    for (const sample of this.#samples) if (best === null || sample.trip < best.trip) best = sample
    return best?.offset ?? 0
  }

  /** Records one round trip. False, and ignored, for one that cannot have happened. */
  add(sentAt: number, roomNow: number, receivedAt: number): boolean {
    const trip = receivedAt - sentAt
    if (![sentAt, roomNow, receivedAt].every(Number.isFinite) || trip < 0) return false
    this.#samples.push({ offset: roomNow - (sentAt + receivedAt) / 2, trip })
    if (this.#samples.length > CLOCK_SAMPLES) this.#samples.shift()
    return true
  }
}
