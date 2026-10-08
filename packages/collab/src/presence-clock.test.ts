import { afterEach, describe, expect, it, vi } from 'vitest'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as Y from 'yjs'

import { createAwareness, startPresenceClock } from './protocol.js'

/*
 * Every open tab used to renew its presence every 15 seconds — y-protocols'
 * fixed pace — so an idle board sent the room four messages a minute, each
 * one waking it. Once a minute is enough to keep a quiet tab on the board,
 * and peers wait two and a half minutes before deciding it has gone
 * (CLAUDE.md rule 29).
 */
describe('the presence clock', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renews this tab’s presence once a minute, not every fifteen seconds', () => {
    vi.useFakeTimers()
    const awareness = createAwareness(new Y.Doc())
    const stop = startPresenceClock(awareness)
    awareness.setLocalState({ name: 'Ada' })
    const sent: number[] = []
    awareness.on('update', () => sent.push(Date.now()))

    vi.advanceTimersByTime(45_000)
    expect(sent).toHaveLength(0)
    vi.advanceTimersByTime(20_000)
    expect(sent).toHaveLength(1)
    stop()
  })

  it('forgets somebody it has not heard from in two and a half minutes', () => {
    vi.useFakeTimers()
    const here = createAwareness(new Y.Doc())
    const there = createAwareness(new Y.Doc())
    const stop = startPresenceClock(here)
    there.setLocalState({ name: 'Bo' })
    awarenessProtocol.applyAwarenessUpdate(
      here,
      awarenessProtocol.encodeAwarenessUpdate(there, [there.clientID]),
      'room',
    )
    expect(here.getStates().has(there.clientID)).toBe(true)

    // Long past y-protocols' own 30 seconds, and still here.
    vi.advanceTimersByTime(120_000)
    expect(here.getStates().has(there.clientID)).toBe(true)
    vi.advanceTimersByTime(45_000)
    expect(here.getStates().has(there.clientID)).toBe(false)
    stop()
  })

  it('leaves no timer behind once stopped', () => {
    vi.useFakeTimers()
    const awareness = createAwareness(new Y.Doc())
    const stop = startPresenceClock(awareness)
    stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
