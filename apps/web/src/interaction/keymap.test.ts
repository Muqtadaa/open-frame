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
