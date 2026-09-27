import { useEffect, type RefObject } from 'react'

/**
 * How every sheet lets go: Escape, or a press anywhere outside it.
 *
 * One hook, because each sheet had its own opinion. The account sheet closed
 * on both; the sign-in and share sheets on neither, so somebody who opened one
 * by mistake had to find the control that had opened it and press it again.
 *
 * Both listeners are CAPTURE phase and Escape is stopped there: the board's
 * keymap also reads Escape (as "clear the selection"), and the canvas would
 * otherwise take the press first — one key closed the sheet and changed the
 * board.
 *
 * `trigger` is left out of "outside", because pressing it toggles the sheet
 * itself; counted as outside, the sheet would close on pointerdown and open
 * again on the click.
 */
export function useDismiss(
  sheet: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
): void {
  useEffect(() => {
    if (!active) return
    const outside = (event: Event): void => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (sheet.current?.contains(target) === true) return
      if (trigger.current?.contains(target) === true) return
      onClose()
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('pointerdown', outside, true)
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      window.removeEventListener('keydown', escape, true)
    }
  }, [sheet, trigger, onClose, active])
}

/**
 * Takes the keyboard into a sheet as it opens: its first control, unless it
 * names a better one. A sheet that left focus on its trigger put its own
 * contents dozens of Tabs away, past the whole board.
 */
export function useFocusOnOpen(
  sheet: RefObject<HTMLElement | null>,
  preferred?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    /*
     * A few frames' grace: an anchored sheet is laid out only once its anchor
     * has been measured, so on the first pass there can be nothing to focus.
     */
    let frame = 0
    let tries = 0
    const attempt = (): void => {
      const target =
        preferred?.current ??
        sheet.current?.querySelector<HTMLElement>(
          'input:not([type="hidden"]), button:not([aria-disabled="true"]), a[href]',
        )
      if (target !== null && target !== undefined) {
        target.focus()
        return
      }
      if (++tries < 10) frame = requestAnimationFrame(attempt)
    }
    attempt()
    return () => cancelAnimationFrame(frame)
    // Once, on arrival: a sheet is not re-focused by its own re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
