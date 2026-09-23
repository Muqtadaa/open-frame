import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveKeyAction, type KeyContext } from './keymap.js'
import { SHAPE_KINDS } from '@openframe/core'

import { shapePath } from '../scene/shape-geometry.js'
import { CURSOR_GEOMETRY, cursorFor, DEFAULT_INK } from './tool-cursor.js'
import type { Tool } from './interaction-store.js'

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
 * And every tool you aim before pressing says so with its OWN mark.
 *
 * This used to check the stylesheet for a `.of-canvas--<tool>` rule, because
 * the cursor was `crosshair` written out once per tool. That answered "you
 * are about to put something down" and never which thing — the same plus sign
 * for a sticky note, a table and a remark. The marks moved to
 * `tool-cursor.ts`, and `Record<Tool, …>` makes a MISSING tool a compile
 * error; what a type cannot catch is a tool added with `null`, which is a
 * deliberate "no mark" and is right for exactly two of them.
 */
describe('every placing tool carries its own cursor', () => {
  const TOOLBAR = readFileSync(resolve(process.cwd(), 'src/ui/Toolbar.tsx'), 'utf8')
  const ids = [...TOOLBAR.matchAll(/\{\s*id:\s*'([a-z]+)',\s*label:/g)].map(([, id]) => id ?? '')

  /*
   * `select` acts on what is already on the board rather than aiming at empty
   * space, and `pan` has a hand every user of every map already knows.
   */
  const aiming = ids.filter((id) => id !== 'select' && id !== 'pan')

  it('finds the rail to read, so the cases below are not vacuous', () => {
    expect(aiming.length).toBeGreaterThanOrEqual(8)
  })

  it.each(aiming)('%s', (id) => {
    const cursor = cursorFor(id as Tool)
    expect(cursor, 'no mark, so this tool shows somebody else\'s pointer').not.toBeNull()
    expect(cursor).toContain('data:image/svg+xml')
    /*
     * A KEYWORD after the image. A data URI cursor is refused outright on
     * some platforms, and a declaration with nothing to fall back to is
     * dropped whole — leaving the arrow, which says nothing about a tool
     * being armed at all.
     */
    expect(cursor).toMatch(/,\s*crosshair$/)
  })

  it('leaves the two that should keep the platform\'s own', () => {
    expect(cursorFor('select')).toBeNull()
    expect(cursorFor('pan')).toBeNull()
  })

  /** The rim. A single-coloured cursor vanishes into at least one board. */
  it('draws each mark twice, so it reads on any ground', () => {
    const decoded = decodeURIComponent(cursorFor('comment') ?? '')
    expect(decoded).toContain(DEFAULT_INK.halo)
    expect(decoded).toContain(DEFAULT_INK.ink)
  })

  /**
   * Drawn in the THEME's ink, not in a second copy of the palette.
   *
   * A cursor is an image and cannot inherit a custom property, which makes it
   * exactly the kind of thing that keeps a stale palette alive long after the
   * stylesheet has moved on. The colours are passed in from the tokens.
   */
  it('takes its colours from whichever world is being drawn in', () => {
    const night = decodeURIComponent(
      cursorFor('comment', 'rectangle', { ink: '#f2f5f8', halo: '#101820' }) ?? '',
    )
    expect(night).toContain('#f2f5f8')
    expect(night).toContain('#101820')
    expect(night).not.toContain(DEFAULT_INK.ink)
  })

  /**
   * The rail's shape icon follows the chosen variant, and a pointer showing a
   * rectangle while the rail shows a diamond is the interface disagreeing
   * with itself.
   */
  it('follows the shape variant the rail is showing', () => {
    const seen = SHAPE_KINDS.map((kind) => cursorFor('shape', kind))
    for (const [index, cursor] of seen.entries()) {
      expect(cursor, `${SHAPE_KINDS[index] ?? '?'} has no cursor`).not.toBeNull()
    }
    expect(new Set(seen).size, 'two shape variants share a cursor').toBe(SHAPE_KINDS.length)
  })

  /**
   * The parts have to FIT the box they are drawn in, and not each other.
   *
   * A cursor is clipped to its own width and height with no warning — the
   * corner simply is not there — and nothing about a translate, a scale and
   * half a stroke says whether they add up. Both halves have already been got
   * wrong: the glyph once ran past the right edge, and the crosshair was
   * drawn hard against the top-left, where the rim it is outlined with had
   * nowhere to go and came out cut flat.
   *
   * Arithmetic on the numbers themselves rather than judgement about them,
   * because growing the cursor is exactly when this gets got wrong.
   */
  describe('the cursor fits together', () => {
    const { size, rim, arm, hot, place, scale, ink } = CURSOR_GEOMETRY

    it('leaves room for the rim around the crosshair', () => {
      // The rim is stroked outside the path, half either side.
      expect(hot - arm - rim / 2, 'the crosshair is cut off at the top left').toBeGreaterThanOrEqual(0)
    })

    it('points where the crosshair crosses', () => {
      // A hotspot anywhere else is a cursor that aims at a different pixel
      // from the one it draws a cross on.
      const svg = decodeURIComponent(cursorFor('comment') ?? '')
      const spot = /"\)\s(\d+(?:\.\d+)?)\s(\d+(?:\.\d+)?),/.exec(cursorFor('comment') ?? '')
      expect(spot?.[1]).toBe(String(hot))
      expect(spot?.[2]).toBe(String(hot))
      // Drawn symmetrically about that point, rather than reaching further
      // one way than the other.
      expect(svg).toContain(`M${String(hot - arm)} `)
    })

    it('keeps the glyph inside the box', () => {
      expect(place + ink * scale + rim / 2, 'the glyph runs out of the cursor').toBeLessThanOrEqual(size)
    })

    it('keeps the glyph off the crosshair', () => {
      // Two marks that touch read as one shape rather than as a tool held
      // beside a point.
      expect(place - rim / 2, 'the glyph overlaps the crosshair').toBeGreaterThanOrEqual(hot + arm)
    })

    /**
     * A stroke inside a scaled group is scaled with it, so the same written
     * width came out twice as fat on the glyph as on the crosshair — one
     * cursor outlined two ways.
     */
    it('rims both halves at the same weight', () => {
      const svg = decodeURIComponent(cursorFor('comment') ?? '')
      expect(svg).toContain(`stroke-width="${String(rim)}"`)
      expect(svg).toContain(`stroke-width="${String(rim / scale)}"`)
    })
  })

  /** And the geometry is the object's own, so a new kind arrives with one. */
  it('draws the variant from the same geometry the object is drawn from', () => {
    const diamond = decodeURIComponent(cursorFor('shape', 'diamond') ?? '')
    expect(diamond).toContain(shapePath('diamond') ?? 'no path')
  })
})
