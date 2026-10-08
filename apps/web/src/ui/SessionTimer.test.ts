import { idleTimer, pauseTimer, setDuration, startTimer } from '@openframe/core/facilitation'
import { describe, expect, it } from 'vitest'

import { ticksAt } from './SessionTimer.js'

/*
 * A run that has finished stays `running` until somebody resets it, and the
 * clock went on re-rendering the Session control four times a second for as
 * long as it sat at 0:00 (audit 2026-10-08). It ticks only while there is
 * time left to count.
 */
describe('the timer ticks', () => {
  const set = setDuration(idleTimer(), 60_000, 0, 'Ada')
  const running = startTimer(set, 1_000, 'Ada')

  it('while there is time left', () => {
    expect(ticksAt(running, 30_000)).toBe(true)
  })

  it('not once time is up, though the run is still going', () => {
    expect(running.status).toBe('running')
    expect(ticksAt(running, 61_000)).toBe(false)
  })

  it('not while paused or idle', () => {
    expect(ticksAt(pauseTimer(running, 30_000, 'Ada'), 40_000)).toBe(false)
    expect(ticksAt(set, 40_000)).toBe(false)
  })
})
