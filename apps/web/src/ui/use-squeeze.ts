import { useLayoutEffect, type RefObject } from 'react'

/**
 * What the board's bar gives up, in order, when it runs out of room. Each
 * step keeps every control: a word becomes its icon, a readout its short
 * form. The board's NAME shortens before any of it, because it is the only
 * thing here that can lose characters and still mean something.
 */
export const SQUEEZE = [
  // The account becomes its face; the name is in its sheet and its label.
  'face',
  // The selection count goes: the record panel says it too.
  'count',
  // The exit keeps its arrow: it is the one control with no other route.
  'exit',
  // The readout's short form: "Offline", not "Offline · saved here".
  'brief',
  // The session and the inbox keep their icons and counts.
  'words',
  // A running session keeps its time and its note; an inbox with news, its count.
  'compact',
  // Share becomes its link.
  'icons',
  // The bar's own gaps and rules.
  'tight',
  // And the name gives up a few more characters.
  'name',
  // Last of all, an offline readout is its dot, its words kept for the ear.
  'dot',
] as const

/**
 * Measured, not guessed at widths. The bar used five breakpoints, worked out
 * for whatever it carried at the time, and every control added since made
 * one of them wrong: a shared board's bar ran out of room at 560, then at
 * 640, then at 680. Now it steps through `SQUEEZE` only as far as it has to,
 * whenever its size or its contents change.
 *
 * Written to the element directly rather than through React state: a
 * measurement that re-renders the thing it measured would loop.
 */
export function useSqueeze(bar: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = bar.current
    if (element === null) return
    let busy = false
    /*
     * Every zone's contents inside the zone, and the bar inside the window.
     * A zone is allowed to shrink so the name in it can, and past the name's
     * floor its contents run out of it, under its neighbour, without the bar
     * being any wider at all. Read from where the contents END, not from
     * `scrollWidth`, which counts every tip's hidden box as overflow.
     */
    const inside = (box: Element): boolean => {
      const edge = box.getBoundingClientRect().right
      return [...box.children].every((child) => child.getBoundingClientRect().right <= edge + 1)
    }
    const fits = (): boolean =>
      element.getBoundingClientRect().right <= window.innerWidth + 0.5 &&
      [...element.querySelectorAll(":scope > [role='group']")].every(inside) &&
      [...element.querySelectorAll(":scope > [role='group']")].every(
        (zone) => zone.getBoundingClientRect().right <= element.getBoundingClientRect().right + 1,
      )
    const fit = (): void => {
      if (busy) return
      busy = true
      let steps = 0
      element.setAttribute('data-squeeze', '')
      while (!fits() && steps < SQUEEZE.length) {
        steps += 1
        element.setAttribute('data-squeeze', SQUEEZE.slice(0, steps).join(' '))
      }
      busy = false
    }
    fit()
    const resized = new ResizeObserver(fit)
    resized.observe(element)
    // A readout changing its words, a pill starting to count, a face arriving.
    const changed = new MutationObserver(fit)
    changed.observe(element, { childList: true, subtree: true, characterData: true })
    window.addEventListener('resize', fit)
    return () => {
      resized.disconnect()
      changed.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [bar])
}
