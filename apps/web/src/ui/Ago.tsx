import { useSyncExternalStore } from 'react'

import { describeWhen } from '../app/board-rows.js'

/**
 * When something was said, as the board list says when a board was edited.
 *
 * Relative, because "3 days ago" answers the question somebody coming back to
 * a board is actually asking — is this still live? — and the exact moment is
 * in the tip for whoever needs it. A comment never said when at all: in a
 * product for people who are not online at the same time, fresh discussion
 * and stale looked the same.
 */
/*
 * ONE clock for every Ago on screen, ticking once a minute so "just now" does
 * not go on saying so for as long as a panel stays open. Each row ran its own
 * interval, and a long list of versions or changes ran dozens (audit
 * 2026-10-08). It runs only while something is showing a time.
 */
const minute = (() => {
  let now = Date.now()
  const listeners = new Set<() => void>()
  let tick: number | undefined
  return {
    subscribe: (listener: () => void): (() => void) => {
      if (listeners.size === 0) {
        now = Date.now()
        tick = window.setInterval(() => {
          now = Date.now()
          for (const each of listeners) each()
        }, 60_000)
      }
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) window.clearInterval(tick)
      }
    },
    read: (): number => now,
  }
})()

export function Ago({ at }: { readonly at: number }) {
  const now = useSyncExternalStore(minute.subscribe, minute.read)
  const exact = new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <time
      className="of-ago"
      dateTime={new Date(at).toISOString()}
      data-tip={exact}
      aria-description={exact}
    >
      {describeWhen(at, now)}
    </time>
  )
}
