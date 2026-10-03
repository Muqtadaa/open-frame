import { describe, expect, it } from 'vitest'

import { InFlight } from './in-flight.js'

/**
 * Writes a room has already admitted, so a destroy can wait for them.
 *
 * R2 is not Durable Object storage: while an upload awaits it, the runtime
 * lets other requests run — including the owner's destroy. Without this, an
 * upload admitted a moment before deletion began could land after the bucket
 * was swept, and its bytes would outlive the board.
 */
describe('writes in flight', () => {
  it('lets a drain finish at once when nothing is running', async () => {
    await expect(new InFlight().drain()).resolves.toBeUndefined()
  })

  it('makes a drain wait for every write already started', async () => {
    const writes = new InFlight()
    const finish: (() => void)[] = []
    const started = [1, 2].map(() =>
      writes.track(new Promise<void>((resolve) => finish.push(resolve))),
    )

    let drained = false
    const draining = writes.drain().then(() => {
      drained = true
    })
    await Promise.resolve()
    expect(drained).toBe(false)

    finish[0]?.()
    await started[0]
    await Promise.resolve()
    expect(drained).toBe(false)

    finish[1]?.()
    await draining
    expect(drained).toBe(true)
  })

  /** A failed upload must not stop the board from being deleted. */
  it('drains past a write that failed, and still hands the failure to its caller', async () => {
    const writes = new InFlight()
    const failing = writes.track(Promise.reject(new Error('R2 is down')))

    await expect(failing).rejects.toThrow('R2 is down')
    await expect(writes.drain()).resolves.toBeUndefined()
  })

  it('forgets a write once it has finished', async () => {
    const writes = new InFlight()
    await writes.track(Promise.resolve('done'))

    expect(writes.size).toBe(0)
  })
})
