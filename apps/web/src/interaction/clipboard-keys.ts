import type { ClipboardPayload } from './clipboard-format.js'

/**
 * What the keyboard and the browser's own clipboard events tell each other.
 *
 * Cmd/Ctrl+C, X and V are left to the browser, because only inside its own
 * `copy`, `cut` and `paste` events can a page write and read the system
 * clipboard without asking anybody's permission. But a browser does not
 * always fire them when nothing is selected as TEXT — so the key does the
 * board's own part at once (copies into this tab, cuts, or arranges to paste
 * this tab's copy), and the event, when it comes, takes over from there.
 */

let keyed: ClipboardPayload | null = null
let fallback: ReturnType<typeof setTimeout> | null = null

/** A copy or cut the key has just made, for the event that follows it to write. */
export function keyCopied(payload: ClipboardPayload | null): void {
  keyed = payload
  setTimeout(() => {
    keyed = null
  }, 0)
}

/** What the key just copied, once: an event with nothing selected writes this. */
export function takeKeyCopy(): ClipboardPayload | null {
  const payload = keyed
  keyed = null
  return payload
}

/**
 * The key wants a paste. If no `paste` event arrives — a browser that will not
 * fire one with nothing editable focused — this tab's own copy is pasted.
 */
export function expectPaste(run: () => void): void {
  if (fallback !== null) clearTimeout(fallback)
  fallback = setTimeout(() => {
    fallback = null
    run()
  }, 0)
}

/** A `paste` event arrived, so the fallback is not needed. */
export function pasteArrived(): void {
  if (fallback === null) return
  clearTimeout(fallback)
  fallback = null
}
