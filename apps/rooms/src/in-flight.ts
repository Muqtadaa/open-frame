/**
 * Writes a room has admitted and not yet finished, so they can be waited for.
 *
 * A Durable Object only holds other requests back while it awaits its OWN
 * storage. Anything else — R2 above all — lets them interleave, so an upload
 * that passed every check can still be mid-`put` when the owner's destroy
 * starts. The destroy drains these before it sweeps the bucket; otherwise the
 * upload lands after the sweep and its bytes outlive the board.
 */
export class InFlight {
  readonly #running = new Set<Promise<unknown>>()

  /** Runs `write` as tracked work, and answers exactly what it answers. */
  track<T>(write: Promise<T>): Promise<T> {
    // Forgotten in `finally`, so it is gone before its caller resumes.
    const tracked = write.finally(() => this.#running.delete(quiet))
    // What a drain waits on: never rejects, so one failed upload cannot stop
    // a board being deleted.
    const quiet = tracked.then(
      () => undefined,
      () => undefined,
    )
    this.#running.add(quiet)
    return tracked
  }

  /**
   * Resolves once every write started so far has finished, whether it
   * succeeded or not: a failed upload must not stop a board being deleted.
   */
  async drain(): Promise<void> {
    await Promise.all(this.#running)
  }

  get size(): number {
    return this.#running.size
  }
}
