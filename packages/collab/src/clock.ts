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

/**
 * How far past their combined error two trips may disagree before the device's
 * clock is taken to have jumped. Each sample is right to within half its trip;
 * this allows for routes that are slower one way than the other, and is far
 * below the seconds a sleep or a correction moves a clock by.
 */
const JUMP_MS = 1000

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
    return this.#best()?.offset ?? 0
  }

  /** Records one round trip. False, and ignored, for one that cannot have happened. */
  add(sentAt: number, roomNow: number, receivedAt: number): boolean {
    const trip = receivedAt - sentAt
    if (![sentAt, roomNow, receivedAt].every(Number.isFinite) || trip < 0) return false
    const sample = { offset: roomNow - (sentAt + receivedAt) / 2, trip }
    /*
     * Every earlier trip measured a clock that no longer exists if this one
     * cannot be reconciled with the best of them: kept, the quickest of those
     * would go on winning for eight resyncs (Codex, on #63).
     */
    const best = this.#best()
    if (
      best !== null &&
      Math.abs(sample.offset - best.offset) > (sample.trip + best.trip) / 2 + JUMP_MS
    ) {
      this.#samples = []
    }
    this.#samples.push(sample)
    if (this.#samples.length > CLOCK_SAMPLES) this.#samples.shift()
    return true
  }

  #best(): Sample | null {
    let best: Sample | null = null
    for (const sample of this.#samples) if (best === null || sample.trip < best.trip) best = sample
    return best
  }
}
