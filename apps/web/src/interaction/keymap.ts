import type { Tool } from './interaction-store.js'
import { IS_MAC } from '../scene/platform.js'

/**
 * Keyboard shortcuts, resolved as pure data.
 *
 * The bindings follow the conventions users bring from other canvas tools —
 * V select, H hand, T text, Cmd+0 reset zoom — because a whiteboard that
 * invents its own shortcuts is a whiteboard people fight.
 *
 * Deciding here rather than in the event handler means the whole keymap is
 * testable without synthesising KeyboardEvents, and means there is one place to
 * look when a binding is wrong.
 */

export interface KeyContext {
  readonly key: string
  readonly metaKey: boolean
  readonly ctrlKey: boolean
  readonly shiftKey: boolean
  readonly altKey: boolean
}

export type KeyAction =
  | { readonly kind: 'tool'; readonly tool: Tool }
  | { readonly kind: 'cycle-shape' }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'group' }
  | { readonly kind: 'ungroup' }
  | { readonly kind: 'copy' }
  | { readonly kind: 'cut' }
  | { readonly kind: 'paste' }
  | { readonly kind: 'reorder'; readonly placement: 'front' | 'back' | 'forward' | 'backward' }
  | { readonly kind: 'toggle-lock' }
  | { readonly kind: 'select-all' }
  | { readonly kind: 'deselect' }
  | { readonly kind: 'edit-selection' }
  | { readonly kind: 'nudge'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'zoom-in' }
  | { readonly kind: 'zoom-out' }
  | { readonly kind: 'zoom-reset' }
  | { readonly kind: 'zoom-fit' }
  | { readonly kind: 'zoom-selection' }
  | { readonly kind: 'search' }

const NUDGE = 1
const NUDGE_COARSE = 10

const TOOL_KEYS: Readonly<Record<string, Tool>> = {
  v: 'select',
  h: 'pan',
  s: 'sticky',
  // Miro binds sticky notes to N; accept both rather than make people relearn.
  n: 'sticky',
  t: 'text',
  f: 'frame',
  c: 'connector',
  // A table is a grid; a code block is code. Neither initial collides with
  // one already bound, which is the only reason these two are what they are.
  g: 'table',
  k: 'code',
  // C was already the connector, so commenting takes M — which is also what
  // Figma binds it to.
  m: 'comment',
}

const NUDGE_KEYS: Readonly<Record<string, { dx: number; dy: number }>> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
}

/**
 * Returns the action for a keystroke, or `null` to let the browser handle it.
 *
 * A non-null result means the caller must `preventDefault()`. That matters most
 * for the zoom bindings: without it, Cmd/Ctrl +/- zooms the *browser* as well as
 * the canvas, and the two compound into an unusable mess.
 */
export function resolveKeyAction(ctx: KeyContext): KeyAction | null {
  const mod = ctx.metaKey || ctx.ctrlKey
  const key = ctx.key

  if (mod) {
    switch (key) {
      case 'z':
      case 'Z':
        return ctx.shiftKey ? { kind: 'redo' } : { kind: 'undo' }
      case 'y':
      case 'Y':
        return { kind: 'redo' }
      case 'a':
      case 'A':
        return { kind: 'select-all' }
      case 'g':
      case 'G':
        // Shift+Cmd+G ungroups, the convention everywhere this gesture exists.
        return ctx.shiftKey ? { kind: 'ungroup' } : { kind: 'group' }
      case 'd':
      case 'D':
        return { kind: 'duplicate' }
      case 'c':
      case 'C':
        return { kind: 'copy' }
      case 'x':
      case 'X':
        return { kind: 'cut' }
      case 'v':
      case 'V':
        return { kind: 'paste' }
      /*
       * Claimed from the browser's own find-in-page, which would otherwise open
       * over the canvas and search the DOM — finding only what happens to be
       * culled IN, and nothing about an object's semantic fields. Same reason
       * the zoom keys are claimed (rule 13).
       */
      case 'f':
      case 'F':
        return { kind: 'search' }
      case '0':
        return { kind: 'zoom-reset' }
      case '1':
        return { kind: 'zoom-fit' }
      case '2':
        return { kind: 'zoom-selection' }
      // '=' is the unshifted key on most layouts; '+' when shifted. Accept both,
      // or "zoom in" only works on some keyboards.
      case '=':
      case '+':
      case 'Add':
        return { kind: 'zoom-in' }
      case '-':
      case '_':
      case 'Subtract':
        return { kind: 'zoom-out' }
      default:
        return null
    }
  }

  if (ctx.altKey) return null

  const nudge = NUDGE_KEYS[key]
  if (nudge !== undefined) {
    const step = ctx.shiftKey ? NUDGE_COARSE : NUDGE
    return { kind: 'nudge', dx: nudge.dx * step, dy: nudge.dy * step }
  }

  switch (key) {
    case 'Escape':
      return { kind: 'deselect' }
    case 'Delete':
    case 'Backspace':
      return { kind: 'delete' }
    case 'Enter':
      return { kind: 'edit-selection' }
    default:
      break
  }

  // Bracket keys for z-order, matching the convention in design tools.
  // Checked before the shift bail-out below, because Shift is part of them.
  if (key === ']') return { kind: 'reorder', placement: ctx.shiftKey ? 'front' : 'forward' }
  if (key === '[') return { kind: 'reorder', placement: ctx.shiftKey ? 'back' : 'backward' }

  if (ctx.shiftKey) return null

  if (key === 'u' || key === 'U') return { kind: 'cycle-shape' }

  const tool = TOOL_KEYS[key.toLowerCase()]
  return tool === undefined ? null : { kind: 'tool', tool }
}

/** Human-readable accelerator for tooltips, using the platform's modifier glyph. */
/*
 * "Ctrl+Z", not "CtrlZ": the Mac's glyphs read as one symbol with the key and
 * need nothing between them, but a word run into a letter reads as a word.
 */
export function formatShortcut(keys: string, isMac: boolean): string {
  return keys.replace('Mod', isMac ? '⌘' : 'Ctrl+')
}

/**
 * This platform's modifier, as a label shows it.
 *
 * It was worked out three times — in the context menu, the record line and the
 * zoom cluster — from three copies of the same platform sniff, which is how
 * one of them would eventually have disagreed with the others.
 */
export const MOD_KEY = formatShortcut('Mod', IS_MAC)

// Chords as labels and as `aria-keyshortcuts`: pure, so views can use them too.
export { ariaKeys, formatKeys } from '../scene/shortcuts.js'
