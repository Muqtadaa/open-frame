import { describe, expect, it } from 'vitest'

import {
  MAX_TIMER_MS,
  addMinute,
  idleTimer,
  isDone,
  pauseTimer,
  readTimer,
  remainingOf,
  resetTimer,
  resumeTimer,
  setDuration,
  startTimer,
  type SessionTimer,
} from './timer.js'

/**
 * The session timer's rules, as data in and data out.
 *
 * Every peer runs these against the ROOM's clock, so the same timer read on
 * two devices says the same thing. Nothing here knows what a clock is: the
 * time is always an argument.
 */

const MIN = 60_000
const by = 'Ada'

function running(durationMs: number, at: number): SessionTimer {
  return startTimer(setDuration(idleTimer(), durationMs, 0, by), at, by)
}

describe('the session timer', () => {
  it('starts with a five-minute duration and nothing running', () => {
    const timer = idleTimer()
    expect(timer.status).toBe('idle')
    expect(remainingOf(timer, 123)).toBe(5 * MIN)
    expect(isDone(timer, 123)).toBe(false)
  })

  it('runs down against the clock it is given', () => {
    const timer = running(3 * MIN, 1000)
    expect(timer.endsAt).toBe(1000 + 3 * MIN)
    expect(remainingOf(timer, 1000 + MIN)).toBe(2 * MIN)
    expect(isDone(timer, 1000 + 3 * MIN - 1)).toBe(false)
  })

  it('is done once the end has passed, and never reads below zero', () => {
    const timer = running(MIN, 0)
    expect(isDone(timer, MIN)).toBe(true)
    expect(remainingOf(timer, 10 * MIN)).toBe(0)
  })

  it('pauses with what was left, and resumes from it', () => {
    const paused = pauseTimer(running(3 * MIN, 0), MIN, by)
    expect(paused.status).toBe('paused')
    expect(remainingOf(paused, 50 * MIN)).toBe(2 * MIN)
    const resumed = resumeTimer(paused, 10 * MIN, by)
    expect(resumed.endsAt).toBe(12 * MIN)
  })

  it('counts each start as a new run, so a finish is announced once per run', () => {
    const first = running(MIN, 0)
    const again = startTimer(resetTimer(first, 2 * MIN, by), 3 * MIN, by)
    expect(again.run).toBe(first.run + 1)
    // Pausing and resuming is the same run.
    expect(resumeTimer(pauseTimer(again, 3 * MIN + 1, by), 4 * MIN, by).run).toBe(again.run)
  })

  it('resets to the duration it was set to', () => {
    const reset = resetTimer(running(3 * MIN, 0), MIN, by)
    expect(reset.status).toBe('idle')
    expect(remainingOf(reset, 99 * MIN)).toBe(3 * MIN)
  })

  it('will not pause a timer that has already finished', () => {
    const done = running(MIN, 0)
    expect(pauseTimer(done, 2 * MIN, by)).toBe(done)
  })

  describe('adding a minute', () => {
    it('adds to a running timer', () => {
      expect(addMinute(running(MIN, 0), 30_000, by).endsAt).toBe(2 * MIN)
    })

    it('adds to a paused one', () => {
      const paused = pauseTimer(running(3 * MIN, 0), MIN, by)
      expect(remainingOf(addMinute(paused, 2 * MIN, by), 0)).toBe(3 * MIN)
    })

    it('adds to the duration of one not yet started', () => {
      expect(addMinute(idleTimer(), 0, by).durationMs).toBe(6 * MIN)
    })

    it('restarts a finished one with a minute on it, as a new run', () => {
      const done = running(MIN, 0)
      const more = addMinute(done, 5 * MIN, by)
      expect(more.status).toBe('running')
      expect(remainingOf(more, 5 * MIN)).toBe(MIN)
      expect(more.run).toBe(done.run + 1)
    })

    it('never goes past four hours', () => {
      const long = running(MAX_TIMER_MS, 0)
      expect(remainingOf(addMinute(long, 0, by), 0)).toBe(MAX_TIMER_MS)
    })
  })

  it('holds a duration to between a second and four hours', () => {
    expect(setDuration(idleTimer(), 0, 0, by).durationMs).toBe(1000)
    expect(setDuration(idleTimer(), 10 * MAX_TIMER_MS, 0, by).durationMs).toBe(MAX_TIMER_MS)
  })

  it('records who touched it last', () => {
    const timer = pauseTimer(running(3 * MIN, 0), MIN, 'Grace')
    expect(timer.by).toBe('Grace')
    expect(timer.at).toBe(MIN)
  })
})

/*
 * Anybody who can edit the board can write this record, so it is arbitrary
 * JSON until shown otherwise (rule 8).
 */
describe('reading a timer someone else wrote', () => {
  it('reads one it wrote itself', () => {
    const timer = running(3 * MIN, 0)
    expect(readTimer(structuredClone(timer))).toEqual(timer)
  })

  it.each([
    ['nothing', null],
    ['a string', 'running'],
    ['an unknown status', { ...idleTimer(), status: 'done' }],
    ['a newer version', { ...idleTimer(), v: 2 }],
    ['a duration past four hours', { ...idleTimer(), durationMs: MAX_TIMER_MS + 1 }],
    ['a negative remainder', { ...idleTimer(), remainingMs: -1 }],
    ['a running timer with no end', { ...idleTimer(), status: 'running', endsAt: null }],
    ['an end that is not a number', { ...idleTimer(), status: 'running', endsAt: 'soon' }],
    ['an extra field', { ...idleTimer(), sound: 'gong' }],
    ['a name that is not a name', { ...idleTimer(), by: 42 }],
  ])('refuses %s', (_, value) => {
    expect(readTimer(value)).toBeNull()
  })
})
