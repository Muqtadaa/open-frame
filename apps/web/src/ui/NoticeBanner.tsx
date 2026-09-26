import { useRef, useState } from 'react'

import { cameFrom, handBackFocus } from './hand-back-focus.js'

interface Props {
  readonly notices: readonly string[]
}

/**
 * Surfaces degraded loads honestly rather than failing silently.
 *
 * A board that contains objects this build cannot interpret is something the
 * user must be told about — quietly continuing is how data gets lost. But it
 * is ADVICE: the board opened and everything else on it works, so it is drawn
 * on the panel stock rather than in the danger colours, which it used to wear
 * and which made one unreadable note look like a board in trouble. Red is for
 * things that failed.
 */
export function NoticeBanner({ notices }: Props) {
  const [dismissed, setDismissed] = useState(false)
  const origin = useRef<Element | null>(null)
  if (notices.length === 0 || dismissed) return null

  return (
    <div
      className="of-notice"
      role="status"
      data-tone="advisory"
      data-testid="notice-banner"
      onFocus={(event) => {
        const from = cameFrom(event)
        if (from !== null) origin.current = from
      }}
    >
      <div className="of-notice__body">{notices.join(' ')}</div>
      <button
        type="button"
        className="of-button of-button--ghost"
        onClick={() => {
          setDismissed(true)
          handBackFocus(origin.current)
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
