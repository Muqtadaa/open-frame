import { useEffect } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { CloseIcon } from './icons.js'

/** How long a message stays up. Long enough to read a sentence, not to nag. */
const TOAST_MS = 5000

/**
 * A transient message about something the user just tried to do.
 *
 * Distinct from the notice banner, which reports the state of the board itself
 * and stays until dismissed. This clears itself, because a rejected file is
 * over the moment it has been read about.
 */
export function Toast() {
  const toast = useInteractionStore((state) => state.toast)
  const showToast = useInteractionStore((state) => state.showToast)

  useEffect(() => {
    if (toast === null) return
    const timer = setTimeout(() => {
      showToast(null)
    }, TOAST_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [toast, showToast])

  if (toast === null) return null

  return (
    <div className="of-toast" role="status" aria-live="polite">
      <span>{toast}</span>
      <button
        type="button"
        className="of-toast__dismiss"
        aria-label="Dismiss"
        onClick={() => {
          showToast(null)
        }}
      >
        <CloseIcon />
      </button>
    </div>
  )
}
