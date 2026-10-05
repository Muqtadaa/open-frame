import type { RefCallback } from 'react'

/**
 * The line count for a clipped text, for browsers that cannot work it out in CSS.
 *
 * `styles/canvas.css` derives it as `round(down, 100cqh / 1lh, 1)` — how many whole
 * lines fit the container — and that is the whole mechanism wherever it
 * works. It divides a length by a length, which Firefox does not support, and
 * a value it cannot compute drops the entire `-webkit-line-clamp`: shape text
 * ran out of its shape, and a note that did not fit lost its ellipsis. Firefox
 * was 12 failures on the first full run in it, and two were this.
 *
 * So where the division is unsupported, the same number is measured instead:
 * the container's content height over the text's line height. A resize is the
 * only thing that changes either (zoom is a transform, which never resizes a
 * layout box), so a ResizeObserver is all it takes — nothing per frame, and in
 * a browser that has the CSS nothing at all.
 */

/** How many whole lines of `lineHeight` fit in `height`: never fewer than one. */
export function linesThatFit(height: number, lineHeight: number): number {
  if (!(lineHeight > 0) || !(height > 0)) return 1
  // A hair of tolerance: 3 × 18.9 lines in a 56.7 box are three lines, even
  // when the layout rounds the box a thousandth under.
  return Math.max(1, Math.floor(height / lineHeight + 1e-3))
}

const CSS_DERIVES_IT =
  typeof CSS === 'undefined' ||
  typeof CSS.supports !== 'function' ||
  CSS.supports('width', 'calc(100cqh / 1lh * 1px)')

/** The nearest ancestor `100cqh` is measured against. */
function sizeContainerOf(element: HTMLElement): HTMLElement | null {
  for (let at = element.parentElement; at !== null; at = at.parentElement) {
    if (getComputedStyle(at).containerType.includes('size')) return at
  }
  return null
}

/**
 * The text's line height in pixels — ASKED of the browser as `1lh`, the same
 * unit the CSS divides by, rather than read off `line-height`. A table cell
 * sets no line height, so it computes as `normal`, which has no number: its
 * size depends on the font and the platform, and a guess at 1.2 times the font
 * size clamped a line early, or let one too many through, in a row sized near
 * the boundary (Codex, on #32).
 */
function lineHeightOf(element: HTMLElement): number {
  const stated = parseFloat(getComputedStyle(element).lineHeight)
  if (Number.isFinite(stated)) return stated
  const probe = element.ownerDocument.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;height:1lh;padding:0;border:0'
  element.append(probe)
  try {
    // The computed height, not a bounding box: the board is drawn under a
    // zoom transform, and a line height in world units is what is wanted.
    return parseFloat(getComputedStyle(probe).height)
  } finally {
    probe.remove()
  }
}

function contentHeightOf(container: HTMLElement): number {
  const style = getComputedStyle(container)
  return (
    container.clientHeight -
    (parseFloat(style.paddingTop) || 0) -
    (parseFloat(style.paddingBottom) || 0)
  )
}

const texts = new Map<Element, Set<HTMLElement>>()
const containers = new Map<HTMLElement, HTMLElement>()
let observer: ResizeObserver | null = null

function measure(text: HTMLElement): void {
  const container = containers.get(text)
  if (container === undefined) return
  const lines = String(linesThatFit(contentHeightOf(container), lineHeightOf(text)))
  if (text.style.getPropertyValue('--of-clamp-lines') !== lines) {
    text.style.setProperty('--of-clamp-lines', lines)
  }
}

function watch(target: Element, text: HTMLElement): void {
  let set = texts.get(target)
  if (set === undefined) {
    set = new Set()
    texts.set(target, set)
    observer?.observe(target)
  }
  set.add(text)
}

function unwatch(target: Element, text: HTMLElement): void {
  const set = texts.get(target)
  if (set === undefined) return
  set.delete(text)
  if (set.size === 0) {
    texts.delete(target)
    observer?.unobserve(target)
  }
}

function register(text: HTMLElement): () => void {
  const container = sizeContainerOf(text)
  if (container === null) return () => undefined
  observer ??= new ResizeObserver((entries) => {
    for (const entry of entries) for (const each of texts.get(entry.target) ?? []) measure(each)
  })
  containers.set(text, container)
  // The container for its height; the text itself because a new size or
  // face changes the line height without resizing the container.
  watch(container, text)
  watch(text, text)
  measure(text)
  return () => {
    unwatch(container, text)
    unwatch(text, text)
    containers.delete(text)
  }
}

const inert: RefCallback<HTMLElement> = () => undefined

/**
 * A ref for an element that carries the clamp rule. Does nothing where CSS
 * works the count out itself.
 */
export const lineClamp: RefCallback<HTMLElement> = CSS_DERIVES_IT
  ? inert
  : (element) => (element === null ? undefined : register(element))
