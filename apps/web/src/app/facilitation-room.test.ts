import type { BoardConnection, Facilitation } from '@openframe/collab'
import { idleTimer, playMusic, startTimer, stoppedMusic } from '@openframe/core/facilitation'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { roomFacilitation } from './facilitation-room.js'

/** A shared board's timer: the room's state, on the room's clock. */

function fakeConnection() {
  let state: Facilitation = { timer: null, music: null }
  const facilitationListeners = new Set<(state: Facilitation) => void>()
  const clockListeners = new Set<() => void>()
  let asked = 0
  let synced = false
  const statusListeners = new Set<(status: string) => void>()
  const connection = {
    get clockSynced() {
      return synced
    },
    onStatus: (listener: (status: string) => void) => {
      statusListeners.add(listener)
      listener('connecting')
      return () => statusListeners.delete(listener)
    },
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
      state = { ...state, timer }
      for (const listener of facilitationListeners) listener(state)
    },
    writeMusic: (music: Facilitation['music']) => {
      state = { ...state, music }
      for (const listener of facilitationListeners) listener(state)
    },
  }
  return {
    connection: connection as unknown as BoardConnection,
    asked: () => asked,
    tick: () => {
      for (const listener of clockListeners) listener()
    },
    answer: () => {
      synced = true
      for (const listener of clockListeners) listener()
    },
    connect: () => {
      for (const listener of statusListeners) listener('connected')
    },
  }
}

describe('a timer on a shared board', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads and writes the room’s music beside its timer', () => {
    const fake = fakeConnection()
    const channel = roomFacilitation(fake.connection)
    const music = playMusic(stoppedMusic('jazzy'), 1000, 'Ada', [
      { id: 'jazzy-1', durationMs: 60_000 },
    ])
    let told = 0
    channel.subscribe(() => (told += 1))
    channel.writeMusic(music)
    expect(channel.music()).toEqual(music)
    expect(channel.timer()).toBeNull()
    expect(told).toBe(1)
    channel.dispose()
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

  /*
   * A deadline written before the room has said what time it is is written on
   * this device's clock, and the room's answer cannot repair it afterwards
   * (Codex, on #63). So the timer cannot be run until the clock is known.
   */
  it('is not ready to run until the room has said what time it is', () => {
    const fake = fakeConnection()
    const channel = roomFacilitation(fake.connection)
    let told = 0
    channel.subscribe(() => (told += 1))
    expect(channel.ready()).toBe(false)
    fake.answer()
    expect(channel.ready()).toBe(true)
    expect(told).toBe(1)
    channel.dispose()
  })

  it('stops waiting for a room too old to answer, a few seconds after connecting', () => {
    vi.useFakeTimers()
    const fake = fakeConnection()
    const channel = roomFacilitation(fake.connection)
    let told = 0
    channel.subscribe(() => (told += 1))
    vi.advanceTimersByTime(60_000)
    // Still connecting: an unanswered question means nothing yet.
    expect(channel.ready()).toBe(false)
    fake.connect()
    vi.advanceTimersByTime(5000)
    expect(channel.ready()).toBe(true)
    expect(told).toBe(1)
    channel.dispose()
  })
})
