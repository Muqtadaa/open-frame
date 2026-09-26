import { useEffect, useState } from 'react'

import { describeWhen } from '../app/boards.js'

/**
 * When something was said, as the board list says when a board was edited.
 *
 * Relative, because "3 days ago" answers the question somebody coming back to
 * a board is actually asking — is this still live? — and the exact moment is
 * in the tip for whoever needs it. A comment never said when at all: in a
 * product for people who are not online at the same time, fresh discussion
 * and stale looked the same.
 */
export function Ago({ at }: { readonly at: number }) {
  /*
   * A clock that ticks once a minute, so "just now" does not go on saying so
   * for as long as the panel stays open.
   */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = window.setInterval(() => {
      setNow(Date.now())
    }, 60_000)
    return () => {
      window.clearInterval(tick)
    }
  }, [])
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
