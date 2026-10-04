import { idleTimer, playMusic, startTimer, stoppedMusic } from '@openframe/core/facilitation'
import { asBoardId } from '@openframe/core'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { localFacilitation } from './facilitation-local.js'

/**
 * A local board's timer: this device's clock, this browser's storage.
 *
 * A facilitator who refreshes mid-exercise must find the clock still running,
 * so the timer is kept per board and read back on load.
 */
describe('a timer on a board that is nobody else’s', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  const board = asBoardId('brd_local')

  it('survives a reload', () => {
    const timer = startTimer(idleTimer(), 1000, null)
    localFacilitation(board, () => 0).writeTimer(timer)
    expect(localFacilitation(board, () => 0).timer()).toEqual(timer)
  })

  it('keeps its music through a reload too, beside the timer', () => {
    const music = playMusic(stoppedMusic('calm'), 1000, null, [
      { id: 'calm-1', durationMs: 60_000 },
    ])
    const timer = startTimer(idleTimer(), 1000, null)
    const channel = localFacilitation(board, () => 0)
    channel.writeTimer(timer)
    channel.writeMusic(music)
    const reloaded = localFacilitation(board, () => 0)
    expect(reloaded.music()).toEqual(music)
    expect(reloaded.timer()).toEqual(timer)
  })

  it('is kept per board', () => {
    localFacilitation(board, () => 0).writeTimer(startTimer(idleTimer(), 1000, null))
    expect(localFacilitation(asBoardId('brd_other'), () => 0).timer()).toBeNull()
  })

  it('tells whoever is listening, and reads the same object until it changes', () => {
    const channel = localFacilitation(board, () => 0)
    let told = 0
    channel.subscribe(() => (told += 1))
    channel.writeTimer(startTimer(idleTimer(), 1000, null))
    expect(told).toBe(1)
    expect(channel.timer()).toBe(channel.timer())
  })

  it('runs on the clock it is given, which is ready at once', () => {
    const channel = localFacilitation(board, () => 1234)
    expect(channel.now()).toBe(1234)
    expect(channel.ready()).toBe(true)
  })

  it('reads nothing from storage that is not a timer', () => {
    localStorage.setItem('openframe:timer:brd_local', '{"status":"forever"}')
    expect(localFacilitation(board, () => 0).timer()).toBeNull()
  })

  it('keeps working in the tab when storage is refused', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const channel = localFacilitation(board, () => 0)
    const timer = startTimer(idleTimer(), 1000, null)
    channel.writeTimer(timer)
    expect(channel.timer()).toEqual(timer)
  })
})
