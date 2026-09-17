import { useState } from 'react'

interface Props {
  readonly notices: readonly string[]
  readonly readOnly: boolean
}

/**
 * Surfaces degraded loads honestly rather than failing silently.
 *
 * A board that opened read-only because it could not be parsed, or that
 * contains objects this build cannot interpret, is something the user must be
 * told about — quietly continuing is how data gets lost.
 */
export function NoticeBanner({ notices, readOnly }: Props) {
  const [dismissed, setDismissed] = useState(false)
  if (notices.length === 0 || dismissed) return null

  return (
    <div
      className={`of-notice${readOnly ? ' of-notice--danger' : ''}`}
      role="status"
      data-testid="notice-banner"
    >
      <div className="of-notice__body">
        {readOnly ? <strong>Read-only. </strong> : null}
        {notices.join(' ')}
      </div>
      <button
        type="button"
        className="of-button of-button--ghost"
        onClick={() => setDismissed(true)}
      >
        Dismiss
      </button>
    </div>
  )
}
