/**
 * The keys a list of controls answers to: one way, for every menu, radio
 * group and list in a dialog (WAI-ARIA's roving focus).
 *
 * Each of them used to walk itself, and each did it a little differently. Some
 * took the arrow from the board and some let it through, so walking a radio
 * group or the Inbox also nudged whatever was selected underneath; one menu
 * let Tab walk out of it and stayed open behind. Here the press is taken from
 * everything else whenever the list uses it, and only then.
 *
 * Real focus moves, rather than an active descendant: these are lists of
 * buttons, each of which can be pressed. A list whose focus stays in a field
 * — a combobox, a tree read by a screen reader — keeps its index with
 * `useActiveIndex` instead.
 */

/** A menu's items, the plain ones and the ones that check. */
export const MENU_ITEMS = '[role^="menuitem"]'

/** A radio group's options. Its arrows choose as they go. */
export const RADIOS = '[role="radio"]'

/** Which arrows walk the list: a column, a row, or either for a radio group. */
export type Orientation = 'vertical' | 'horizontal' | 'both'

export interface RovingOptions {
  /** The list's items, as a selector inside the element holding the handler. */
  readonly items: string
  readonly orientation?: Orientation
  /** Past either end to the other, as a menu does, or stop there. */
  readonly wrap?: boolean
  /** Home and End go to either end. */
  readonly homeEnd?: boolean
  /** A letter goes to the next item that begins with it, as a menu's does. */
  readonly typeahead?: boolean
  /**
   * Tab leaves. A menu that Tab leaves is a menu Tab CLOSES, so a list that
   * passes this takes the Tab and is told which way it went.
   */
  readonly onTab?: (backward: boolean) => void
}

/** The parts of a key press this reads: a React one, or a test's stand-in. */
export interface KeyPress {
  readonly key: string
  readonly shiftKey: boolean
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly altKey: boolean
  readonly currentTarget: Element
  readonly preventDefault: () => void
  readonly stopPropagation: () => void
}

/** Where the press went: the item now focused, and its place in the list. */
export interface Stepped {
  readonly element: HTMLElement
  readonly index: number
}

const FORWARD: Readonly<Record<Orientation, readonly string[]>> = {
  vertical: ['ArrowDown'],
  horizontal: ['ArrowRight'],
  both: ['ArrowDown', 'ArrowRight'],
}

const BACK: Readonly<Record<Orientation, readonly string[]>> = {
  vertical: ['ArrowUp'],
  horizontal: ['ArrowLeft'],
  both: ['ArrowUp', 'ArrowLeft'],
}

/** The index a press goes to in a list of `count`, or null when it means nothing here. */
export function targetIndex(
  key: string,
  at: number,
  count: number,
  {
    orientation = 'vertical',
    wrap = true,
    homeEnd = true,
  }: Pick<RovingOptions, 'orientation' | 'wrap' | 'homeEnd'> = {},
): number | null {
  if (count === 0) return null
  const last = count - 1
  if (FORWARD[orientation].includes(key)) {
    if (at < 0) return 0
    return at >= last ? (wrap ? 0 : last) : at + 1
  }
  if (BACK[orientation].includes(key)) {
    if (at < 0) return last
    return at <= 0 ? (wrap ? last : 0) : at - 1
  }
  if (homeEnd && key === 'Home') return 0
  if (homeEnd && key === 'End') return last
  return null
}

/** The next item after `at` whose words begin with `letter`, wrapping. */
function matching(items: readonly HTMLElement[], at: number, letter: string): number | null {
  for (let step = 1; step <= items.length; step++) {
    const index = (at + step) % items.length
    if (items[index]?.textContent?.trim().toLowerCase().startsWith(letter) === true) return index
  }
  return null
}

/**
 * Moves focus for a key pressed inside a list, and takes the press from the
 * board and everything else when it did. Returns where it went, or null when
 * the key meant nothing to the list and was left alone.
 */
export function stepFocus(event: KeyPress, options: RovingOptions): Stepped | null {
  if (event.key === 'Tab' && options.onTab !== undefined) {
    event.preventDefault()
    options.onTab(event.shiftKey)
    return null
  }
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(options.items)]
  const at = items.indexOf(document.activeElement as HTMLElement)
  let to = targetIndex(event.key, at, items.length, options)
  if (
    to === null &&
    options.typeahead === true &&
    event.key.length === 1 &&
    /\S/.test(event.key) &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  ) {
    to = matching(items, at, event.key.toLowerCase())
  }
  const element = to === null ? undefined : items[to]
  if (to === null || element === undefined) return null
  event.preventDefault()
  // The board's keymap listens on the window, and to it an arrow is a nudge.
  event.stopPropagation()
  element.focus()
  return { element, index: to }
}

/**
 * The same keys for a list whose focus stays where it is — a field offering
 * matches, a tree read through `aria-activedescendant` — so only an index
 * moves. Returns the index the press goes to, having taken the press, or null
 * when the key meant nothing to the list and was left alone: Home and End in
 * a field are the caret's unless the list asks for them.
 */
export function stepIndex(
  event: Pick<KeyPress, 'key' | 'preventDefault' | 'stopPropagation'>,
  at: number,
  count: number,
  options: Pick<RovingOptions, 'orientation' | 'wrap' | 'homeEnd'> = {},
): number | null {
  const to = targetIndex(event.key, at, count, options)
  if (to === null) return null
  event.preventDefault()
  event.stopPropagation()
  return to
}
