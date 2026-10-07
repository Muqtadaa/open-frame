import type { KeyboardEvent } from 'react'

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'

/**
 * Tab goes round a panel rather than off its end.
 *
 * An open sheet let Tab walk out of it into the rail behind while it stayed
 * open on screen, so the keyboard was somewhere a sighted person could not
 * see. And past the last control lies the browser itself — the address bar,
 * then back into the page at its first element.
 */
export function wrapTab(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return
  const stops = [...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (first === undefined || last === undefined) return
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === event.currentTarget)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}
