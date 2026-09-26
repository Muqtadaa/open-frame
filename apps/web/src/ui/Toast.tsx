import { useEffect, useRef, useState } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { CloseIcon } from '../controls/icons.js'
import { cameFrom, handBackFocus } from './hand-back-focus.js'

/** How long a message stays up. Long enough to read a sentence, not to nag. */
const TOAST_MS = 5000

/**
 * A transient message about something the user just tried to do.
 *
 * Distinct from the notice banner, which reports the state of the board itself
 * and stays until dismissed. This clears itself, because a rejected file is
 * over the moment it has been read about — but not WHILE it is being read: a
 * pointer over it or the keyboard in it holds the clock, which restarts in
 * full once they leave.
 */
export function Toast() {
  const toast = useInteractionStore((state) => state.toast)
  const showToast = useInteractionStore((state) => state.showToast)
  const [held, setHeld] = useState({ pointer: false, keyboard: false })
  const origin = useRef<Element | null>(null)
  const holding = held.pointer || held.keyboard

  useEffect(() => {
    if (toast === null || holding) return
    const timer = setTimeout(() => {
      showToast(null)
    }, TOAST_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [toast, holding, showToast])

  if (toast === null) return null

  return (
    <div
      className="of-toast"
      role="status"
      aria-live="polite"
      data-testid="toast"
      onPointerEnter={() => {
        setHeld((state) => ({ ...state, pointer: true }))
      }}
      onPointerLeave={() => {
        setHeld((state) => ({ ...state, pointer: false }))
      }}
      onFocus={(event) => {
        const from = cameFrom(event)
        if (from !== null) origin.current = from
        setHeld((state) => ({ ...state, keyboard: true }))
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return
        setHeld((state) => ({ ...state, keyboard: false }))
      }}
    >
      <span className="of-toast__body">{toast}</span>
      <button
        type="button"
        className="of-toast__dismiss"
        aria-label="Dismiss"
        onClick={() => {
          showToast(null)
          handBackFocus(origin.current)
        }}
      >
        <CloseIcon className="of-toast__glyph" />
      </button>
    </div>
  )
}
