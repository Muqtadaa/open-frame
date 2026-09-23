import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveKeyAction, type KeyContext } from './keymap.js'

function key(k: string, mods: Partial<KeyContext> = {}): KeyContext {
  return { key: k, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods }
}

describe('tool shortcuts', () => {
  it.each([
    ['v', 'select'],
    ['h', 'pan'],
    ['s', 'sticky'],
    ['n', 'sticky'],
    ['t', 'text'],
  ])('%s selects the %s tool', (pressed, tool) => {
    expect(resolveKeyAction(key(pressed))).toEqual({ kind: 'tool', tool })
  })

  it('is case-insensitive, so caps lock does not break the tools', () => {
    expect(resolveKeyAction(key('V'))).toEqual({ kind: 'tool', tool: 'select' })
  })

  it('cycles shapes with U', () => {
    expect(resolveKeyAction(key('u'))).toEqual({ kind: 'cycle-shape' })
  })

  it('ignores tool keys held with a modifier, so Cmd+S is not "sticky"', () => {
    expect(resolveKeyAction(key('s', { metaKey: true }))).toBeNull()
    expect(resolveKeyAction(key('h', { ctrlKey: true }))).toBeNull()
    expect(resolveKeyAction(key('t', { altKey: true }))).toBeNull()
  })

  /** Mod+V is paste, not the select tool — the modifier decides. */
  it('distinguishes V from Mod+V', () => {
    expect(resolveKeyAction(key('v'))).toEqual({ kind: 'tool', tool: 'select' })
    expect(resolveKeyAction(key('v', { metaKey: true }))).toEqual({ kind: 'paste' })
  })
})

describe('editing shortcuts', () => {
  it('undoes and redoes', () => {
    expect(resolveKeyAction(key('z', { metaKey: true }))).toEqual({ kind: 'undo' })
    expect(resolveKeyAction(key('z', { metaKey: true, shiftKey: true }))).toEqual({ kind: 'redo' })
    expect(resolveKeyAction(key('y', { ctrlKey: true }))).toEqual({ kind: 'redo' })
  })

  it('selects all, duplicates and deletes', () => {
    expect(resolveKeyAction(key('a', { metaKey: true }))).toEqual({ kind: 'select-all' })
    expect(resolveKeyAction(key('d', { metaKey: true }))).toEqual({ kind: 'duplicate' })
    expect(resolveKeyAction(key('Delete'))).toEqual({ kind: 'delete' })
    expect(resolveKeyAction(key('Backspace'))).toEqual({ kind: 'delete' })
  })

  it('cuts, copies and pastes', () => {
    expect(resolveKeyAction(key('x', { metaKey: true }))).toEqual({ kind: 'cut' })
    expect(resolveKeyAction(key('c', { metaKey: true }))).toEqual({ kind: 'copy' })
    expect(resolveKeyAction(key('v', { metaKey: true }))).toEqual({ kind: 'paste' })
  })

  it('reorders with bracket keys', () => {
    expect(resolveKeyAction(key(']'))).toEqual({ kind: 'reorder', placement: 'forward' })
    expect(resolveKeyAction(key('['))).toEqual({ kind: 'reorder', placement: 'backward' })
    expect(resolveKeyAction(key(']', { shiftKey: true }))).toEqual({
      kind: 'reorder',
      placement: 'front',
    })
    expect(resolveKeyAction(key('[', { shiftKey: true }))).toEqual({
      kind: 'reorder',
      placement: 'back',
    })
  })

  it('escapes and enters editing', () => {
    expect(resolveKeyAction(key('Escape'))).toEqual({ kind: 'deselect' })
    expect(resolveKeyAction(key('Enter'))).toEqual({ kind: 'edit-selection' })
  })
})

describe('nudging', () => {
  it('moves one unit with an arrow', () => {
    expect(resolveKeyAction(key('ArrowLeft'))).toEqual({ kind: 'nudge', dx: -1, dy: 0 })
    expect(resolveKeyAction(key('ArrowDown'))).toEqual({ kind: 'nudge', dx: 0, dy: 1 })
  })

  it('moves ten with shift', () => {
    expect(resolveKeyAction(key('ArrowRight', { shiftKey: true }))).toEqual({
      kind: 'nudge',
      dx: 10,
      dy: 0,
    })
  })
})

/**
 * These bindings exist to be INTERCEPTED. A non-null result tells the caller to
 * preventDefault; without that, Cmd/Ctrl +/- and Cmd/Ctrl+0 drive the browser's
 * own zoom as well as the canvas, and the two compound until the view is
 * unusable. That was a reported bug, not a hypothetical.
 */
describe('zoom shortcuts are claimed, not left to the browser', () => {
  it.each([
    ['=', 'zoom-in'],
    ['+', 'zoom-in'],
    ['-', 'zoom-out'],
    ['_', 'zoom-out'],
    ['0', 'zoom-reset'],
    ['1', 'zoom-fit'],
    ['2', 'zoom-selection'],
  ])('claims Mod+%s', (pressed, kind) => {
    expect(resolveKeyAction(key(pressed, { metaKey: true }))).toEqual({ kind })
    expect(resolveKeyAction(key(pressed, { ctrlKey: true }))).toEqual({ kind })
  })

  it('leaves the same keys alone without a modifier', () => {
    expect(resolveKeyAction(key('0'))).toBeNull()
    expect(resolveKeyAction(key('-'))).toBeNull()
  })
})

describe('unclaimed keys', () => {
  it('returns null so the browser keeps its own behaviour', () => {
    expect(resolveKeyAction(key('q'))).toBeNull()
    expect(resolveKeyAction(key('F5'))).toBeNull()
    expect(resolveKeyAction(key('p', { metaKey: true }))).toBeNull()
  })
})

describe('grouping', () => {
  it('groups on Mod+G', () => {
    expect(resolveKeyAction(key('g', { metaKey: true }))).toEqual({ kind: 'group' })
    expect(resolveKeyAction(key('g', { ctrlKey: true }))).toEqual({ kind: 'group' })
  })

  it('ungroups on Shift+Mod+G', () => {
    expect(resolveKeyAction(key('g', { metaKey: true, shiftKey: true }))).toEqual({
      kind: 'ungroup',
    })
  })

  /** A shifted press reports the uppercase key, which must not fall through. */
  it('handles the uppercase key', () => {
    expect(resolveKeyAction(key('G', { metaKey: true, shiftKey: true }))).toEqual({
      kind: 'ungroup',
    })
  })

  it('leaves a bare g alone rather than grouping without a modifier', () => {
    expect(resolveKeyAction(key('g'))).not.toEqual({ kind: 'group' })
  })
})

/**
 * The rail and the keymap are two claims about the same thing.
 *
 * Every tool button carries `title={`${label} (${shortcut})`}`, so the rail
 * TELLS people which key selects it — and nothing made that true. The comment
 * tool advertised M from the day it was added and M was never bound, which is
 * the worst version of this: a shortcut that is documented in the interface,
 * in front of the user, and does nothing when pressed.
 *
 * Read off the source rather than duplicated here, because a copy of the table
 * is a third claim and would drift from both.
 */
describe('the rail does not promise a shortcut the keymap does not bind', () => {
  const TOOLBAR = readFileSync(resolve(process.cwd(), 'src/ui/Toolbar.tsx'), 'utf8')

  const advertised = [...TOOLBAR.matchAll(/\{\s*id:\s*'([a-z]+)',[^}]*shortcut:\s*'([^']+)'/g)].map(
    ([, id, shortcut]) => ({ id: id ?? '', shortcut: shortcut ?? '' }),
  )

  it('finds the rail to read in the first place', () => {
    // A regex that quietly matches nothing would pass every case below.
    expect(advertised.length).toBeGreaterThanOrEqual(10)
  })

  it.each(advertised)('$shortcut selects $id, as the button says it does', ({ id, shortcut }) => {
    const action = resolveKeyAction(key(shortcut.toLowerCase()))
    /*
     * Shape is reached by `cycle-shape`, which selects the tool AND steps its
     * variant — pressed once from another tool it is a selection, which is
     * why it counts here rather than being excused.
     */
    expect(action).toEqual(id === 'shape' ? { kind: 'cycle-shape' } : { kind: 'tool', tool: id })
  })
})

/**
 * And every tool you aim before pressing says so with a cursor.
 *
 * The canvas is `of-canvas of-canvas--${tool}`, so the class is always there;
 * what was missing for comment, frame, table and code was any rule to match
 * it. An aiming tool with no cursor looks exactly like a tool that did not
 * activate.
 */
describe('every placing tool paints a cursor', () => {
  const CSS = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
  const TOOLBAR = readFileSync(resolve(process.cwd(), 'src/ui/Toolbar.tsx'), 'utf8')
  const ids = [...TOOLBAR.matchAll(/\{\s*id:\s*'([a-z]+)',\s*label:/g)].map(([, id]) => id)

  // `select` acts on what is already on the board rather than aiming at empty
  // space, so the ordinary arrow is the honest cursor for it.
  const aiming = ids.filter((id) => id !== 'select')

  it.each(aiming)('%s', (id) => {
    /*
     * The tool's OWN rule: the class followed by a comma or a brace. Allowing
     * whitespace after it also matched `.of-canvas--comment .of-object`, which
     * is the override that makes the cursor survive an object — so deleting
     * the cursor itself left this passing. Found by deleting it.
     */
    expect(CSS).toMatch(new RegExp(`\\.of-canvas--${id}\\s*[,{]`))
  })
})
