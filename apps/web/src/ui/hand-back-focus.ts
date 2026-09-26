/**
 * Where the keyboard goes when a control it is on disappears.
 *
 * A dismiss button unmounts under its own press, and focus on a removed
 * element falls to the page body — from where the next Tab starts again at
 * the top of the document. So a surface remembers where focus came FROM when
 * it entered, and hands it back there; failing that, to the rail's first
 * tool, the start of the board's own controls.
 */
export function handBackFocus(from: Element | null): void {
  const target =
    from instanceof HTMLElement && from.isConnected
      ? from
      : document.querySelector<HTMLElement>('[data-testid="tool-select"]')
  target?.focus()
}

/** The element focus arrived from, for a surface's `onFocus`. */
export function cameFrom(event: FocusEvent | React.FocusEvent): Element | null {
  const related = event.relatedTarget
  const within = event.currentTarget
  if (!(related instanceof Element)) return null
  return within instanceof Element && within.contains(related) ? null : related
}
