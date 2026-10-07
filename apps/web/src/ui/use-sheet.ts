import { useEffect, type RefObject } from 'react'
import { useEscapeToClose } from '../controls/escape-stack.js'

/**
 * A sheet off a bar button, like Mentions: the keyboard goes in, Escape or a
 * press elsewhere closes it, and focus goes back to the button.
 *
 * Shared by the session timer and the session music, so the two sheets beside
 * each other on the bar cannot drift into behaving differently.
 */
export function useSheet(options: {
  readonly open: boolean
  /** Whether the sheet has been placed, so there is something to focus. */
  readonly placed: boolean
  readonly setOpen: (open: boolean) => void
  readonly sheet: RefObject<HTMLDivElement | null>
  readonly button: RefObject<HTMLButtonElement | null>
  /** What takes the keyboard when it opens; the first button otherwise. */
  readonly first?: string
}): void {
  const { open, placed, setOpen, sheet, button, first } = options

  // Escape closes this sheet only if it is the one opened last.
  useEscapeToClose(() => {
    setOpen(false)
    button.current?.focus()
  }, open)

  useEffect(() => {
    if (!open) return
    const outside = (event: Event): void => {
      if (!(event.target instanceof Node)) return
      if (sheet.current?.contains(event.target) === true) return
      if (button.current?.contains(event.target) === true) return
      setOpen(false)
    }
    window.addEventListener('pointerdown', outside, true)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
    }
  }, [open, setOpen, sheet, button])

  useEffect(() => {
    if (!open || !placed) return
    const target =
      (first === undefined ? null : sheet.current?.querySelector<HTMLElement>(first)) ??
      sheet.current?.querySelector<HTMLElement>('button:not(:disabled)') ??
      sheet.current
    target?.focus()
  }, [open, placed, sheet, first])
}
