import type { BoardConnection, Facilitation } from '@openframe/collab'
import { idleTimer, startTimer } from '@openframe/core/facilitation'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { roomFacilitation } from './facilitation-room.js'

/** A shared board's timer: the room's state, on the room's clock. */

function fakeConnection() {
  let state: Facilitation = { timer: null }
  const facilitationListeners = new Set<(state: Facilitation) => void>()
  const clockListeners = new Set<() => void>()
  let asked = 0
  const connection = {
    serverNow: () => 99_000,
    syncClock: () => (asked += 1),
    onClock: (listener: () => void) => {
      clockListeners.add(listener)
      return () => clockListeners.delete(listener)
    },
    facilitation: () => state,
    onFacilitation: (listener: (next: Facilitation) => void) => {
      facilitationListeners.add(listener)
      listener(state)
      return () => facilitationListeners.delete(listener)
    },
    writeTimer: (timer: Facilitation['timer']) => {
      state = { timer }
      for (const listener of facilitationListeners) listener(state)
    },
  }
  return {
    connection: connection as unknown as BoardConnection,
    asked: () => asked,
    tick: () => {
      for (const listener of clockListeners) listener()
    },
  }
}

describe('a timer on a shared board', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads and writes the room’s timer, on the room’s clock', () => {
    const fake = fakeConnection()
    const channel = roomFacilitation(fake.connection)
    const timer = startTimer(idleTimer(), 1000, 'Ada')
    channel.writeTimer(timer)
    expect(channel.timer()).toEqual(timer)
    expect(channel.now()).toBe(99_000)
    channel.dispose()
  })

  it('tells a listener when the timer changes or the clock is corrected, not on subscribing', () => {
    const fake = fakeConnection()
    const channel = roomFacilitation(fake.connection)
    let told = 0
    const stop = channel.subscribe(() => (told += 1))
    expect(told).toBe(0)
    channel.writeTimer(startTimer(idleTimer(), 1000, 'Ada'))
    fake.tick()
    expect(told).toBe(2)
    stop()
    channel.dispose()
  })

  it('asks the room the time again every few minutes, and when the page comes back', () => {
    vi.useFakeTimers()
    const fake = fakeConnection()
    const channel = roomFacilitation(fake.connection)
    vi.advanceTimersByTime(5 * 60_000)
    expect(fake.asked()).toBe(1)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(fake.asked()).toBe(2)
    channel.dispose()
    vi.advanceTimersByTime(5 * 60_000)
    expect(fake.asked()).toBe(2)
  })
})
