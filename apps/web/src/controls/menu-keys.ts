import type { KeyboardEvent } from 'react'

/**
 * The keys a small menu answers to (WAI-ARIA menu pattern): Up and Down walk
 * its items and wrap, Home and End go to either end, and Tab leaves — which,
 * for a menu, means closing it rather than walking out with it still open.
 */
export function stepMenu(event: KeyboardEvent<HTMLElement>, onTab: () => void): void {
  if (event.key === 'Tab') {
    event.preventDefault()
    onTab()
    return
  }
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
  const at = items.indexOf(document.activeElement as HTMLElement)
  const last = items.length - 1
  const next =
    event.key === 'ArrowDown'
      ? at >= last
        ? 0
        : at + 1
      : event.key === 'ArrowUp'
        ? at <= 0
          ? last
          : at - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null
  if (next === null) return
  event.preventDefault()
  event.stopPropagation()
  items[next]?.focus()
}
