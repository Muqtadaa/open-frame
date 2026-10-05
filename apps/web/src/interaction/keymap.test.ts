import { describe, expect, it } from 'vitest'

import { resolveKeyAction, type KeyContext } from './keymap.js'
import { SHAPE_KINDS } from '@openframe/core'

import { shapePath } from '../scene/shape-geometry.js'
import { createDefaultViewRegistry } from '../views/index.js'
import { CURSOR_GEOMETRY, cursorFor, DEFAULT_INK, markFor } from './tool-cursor.js'

/** The tools the board actually offers: every one a view declares. */
const TOOLS = createDefaultViewRegistry().tools()
const NOTHING_CHOSEN: Readonly<Record<string, unknown>> = {}
/** The cursor for `tool` with `chosen` options, the way the canvas asks for it. */
const cursorOf = (tool: string, chosen = NOTHING_CHOSEN, ink = DEFAULT_INK) =>
  cursorFor(markFor(tool, TOOLS, chosen), ink)

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
    expect(resolveKeyAction(key(pressed), TOOLS)).toEqual({ kind: 'tool', tool })
  })

  it('is case-insensitive, so caps lock does not break the tools', () => {
    expect(resolveKeyAction(key('V'), TOOLS)).toEqual({ kind: 'tool', tool: 'select' })
  })

  it('cycles shapes with U, because the shape tool says so', () => {
    expect(resolveKeyAction(key('u'), TOOLS)).toEqual({ kind: 'cycle-tool', type: 'shape' })
  })

  it('knows only the chrome keys when no type declares a tool', () => {
    expect(resolveKeyAction(key('v'))).toEqual({ kind: 'tool', tool: 'select' })
    expect(resolveKeyAction(key('s'))).toBeNull()
  })

  it('ignores tool keys held with a modifier, so Cmd+S is not "sticky"', () => {
    expect(resolveKeyAction(key('s', { metaKey: true }), TOOLS)).toBeNull()
    expect(resolveKeyAction(key('h', { ctrlKey: true }), TOOLS)).toBeNull()
    expect(resolveKeyAction(key('t', { altKey: true }), TOOLS)).toBeNull()
  })

  /** Mod+V is paste, not the select tool — the modifier decides. */
  it('distinguishes V from Mod+V', () => {
    expect(resolveKeyAction(key('v'), TOOLS)).toEqual({ kind: 'tool', tool: 'select' })
    expect(resolveKeyAction(key('v', { metaKey: true }), TOOLS)).toEqual({ kind: 'paste' })
  })
})

describe('the board overview', () => {
  it('opens on Alt+S, where Miro puts its board summary', () => {
    expect(resolveKeyAction(key('s', { altKey: true }), TOOLS)).toEqual({ kind: 'overview' })
  })

  // On a Mac Option+S types "ß", so the physical key is what says it.
  it('opens on Option+S, which types a different character', () => {
    expect(resolveKeyAction({ ...key('ß', { altKey: true }), code: 'KeyS' }, TOOLS)).toEqual({
      kind: 'overview',
    })
  })

  it('leaves S alone, and Alt with anything else', () => {
    expect(resolveKeyAction(key('s'), TOOLS)).not.toEqual({ kind: 'overview' })
    expect(resolveKeyAction(key('t', { altKey: true }), TOOLS)).toBeNull()
  })
})

describe('editing shortcuts', () => {
  it('undoes and redoes', () => {
    expect(resolveKeyAction(key('z', { metaKey: true }), TOOLS)).toEqual({ kind: 'undo' })
    expect(resolveKeyAction(key('z', { metaKey: true, shiftKey: true }), TOOLS)).toEqual({
      kind: 'redo',
    })
    expect(resolveKeyAction(key('y', { ctrlKey: true }), TOOLS)).toEqual({ kind: 'redo' })
  })

  it('selects all, duplicates and deletes', () => {
    expect(resolveKeyAction(key('a', { metaKey: true }), TOOLS)).toEqual({ kind: 'select-all' })
    expect(resolveKeyAction(key('d', { metaKey: true }), TOOLS)).toEqual({ kind: 'duplicate' })
    expect(resolveKeyAction(key('Delete'), TOOLS)).toEqual({ kind: 'delete' })
    expect(resolveKeyAction(key('Backspace'), TOOLS)).toEqual({ kind: 'delete' })
  })

  it('cuts, copies and pastes', () => {
    expect(resolveKeyAction(key('x', { metaKey: true }), TOOLS)).toEqual({ kind: 'cut' })
    expect(resolveKeyAction(key('c', { metaKey: true }), TOOLS)).toEqual({ kind: 'copy' })
    expect(resolveKeyAction(key('v', { metaKey: true }), TOOLS)).toEqual({ kind: 'paste' })
    expect(resolveKeyAction(key('V', { metaKey: true, shiftKey: true }), TOOLS)).toEqual({
      kind: 'paste',
      plain: true,
    })
  })

  it('reorders with bracket keys', () => {
    expect(resolveKeyAction(key(']'), TOOLS)).toEqual({ kind: 'reorder', placement: 'forward' })
    expect(resolveKeyAction(key('['), TOOLS)).toEqual({ kind: 'reorder', placement: 'backward' })
    expect(resolveKeyAction(key(']', { shiftKey: true }), TOOLS)).toEqual({
      kind: 'reorder',
      placement: 'front',
    })
    expect(resolveKeyAction(key('[', { shiftKey: true }), TOOLS)).toEqual({
      kind: 'reorder',
      placement: 'back',
    })
  })

  it('escapes and enters editing', () => {
    expect(resolveKeyAction(key('Escape'), TOOLS)).toEqual({ kind: 'deselect' })
    expect(resolveKeyAction(key('Enter'), TOOLS)).toEqual({ kind: 'edit-selection' })
  })
})

describe('nudging', () => {
  it('moves one unit with an arrow', () => {
    expect(resolveKeyAction(key('ArrowLeft'), TOOLS)).toEqual({ kind: 'nudge', dx: -1, dy: 0 })
    expect(resolveKeyAction(key('ArrowDown'), TOOLS)).toEqual({ kind: 'nudge', dx: 0, dy: 1 })
  })

  it('moves ten with shift', () => {
    expect(resolveKeyAction(key('ArrowRight', { shiftKey: true }), TOOLS)).toEqual({
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
    expect(resolveKeyAction(key(pressed, { metaKey: true }), TOOLS)).toEqual({ kind })
    expect(resolveKeyAction(key(pressed, { ctrlKey: true }), TOOLS)).toEqual({ kind })
  })

  it('leaves the same keys alone without a modifier', () => {
    expect(resolveKeyAction(key('0'), TOOLS)).toBeNull()
    expect(resolveKeyAction(key('-'), TOOLS)).toBeNull()
  })
})

describe('unclaimed keys', () => {
  it('returns null so the browser keeps its own behaviour', () => {
    expect(resolveKeyAction(key('q'), TOOLS)).toBeNull()
    expect(resolveKeyAction(key('F5'), TOOLS)).toBeNull()
    expect(resolveKeyAction(key('p', { metaKey: true }), TOOLS)).toBeNull()
  })
})

describe('grouping', () => {
  it('groups on Mod+G', () => {
    expect(resolveKeyAction(key('g', { metaKey: true }), TOOLS)).toEqual({ kind: 'group' })
    expect(resolveKeyAction(key('g', { ctrlKey: true }), TOOLS)).toEqual({ kind: 'group' })
  })

  it('ungroups on Shift+Mod+G', () => {
    expect(resolveKeyAction(key('g', { metaKey: true, shiftKey: true }), TOOLS)).toEqual({
      kind: 'ungroup',
    })
  })

  /** A shifted press reports the uppercase key, which must not fall through. */
  it('handles the uppercase key', () => {
    expect(resolveKeyAction(key('G', { metaKey: true, shiftKey: true }), TOOLS)).toEqual({
      kind: 'ungroup',
    })
  })

  it('leaves a bare g alone rather than grouping without a modifier', () => {
    expect(resolveKeyAction(key('g'), TOOLS)).not.toEqual({ kind: 'group' })
  })
})

/**
 * The rail and the keymap are two claims about the same thing.
 *
 * Every tool button shows its key in its tip and `aria-keyshortcuts`, so the
 * rail TELLS people which key selects it — and nothing made that true. The
 * comment tool advertised M from the day it was added and M was never bound,
 * which is the worst version of this: a shortcut that is documented in the
 * interface, in front of the user, and does nothing when pressed.
 *
 * Both now read the same declaration, which is why this reads it too rather
 * than the rail's source: a copy of the table is a third claim.
 */
describe('the rail does not promise a shortcut the keymap does not bind', () => {
  it('finds the tools to read in the first place', () => {
    // A registry that quietly offered nothing would pass every case below.
    expect(TOOLS.length).toBeGreaterThanOrEqual(7)
  })

  it.each(TOOLS.map(({ type, tool }) => ({ type, shown: tool.keys[0] ?? tool.cycleKey ?? '' })))(
    '$shown selects $type, as its button says it does',
    ({ type, shown }) => {
      expect(shown, 'the tip would show no key').not.toBe('')
      const action = resolveKeyAction(key(shown), TOOLS)
      /*
       * A cycling key selects the tool AND steps its variant — pressed once
       * from another tool it is a selection, which is why it counts here
       * rather than being excused.
       */
      expect([
        { kind: 'tool', tool: type },
        { kind: 'cycle-tool', type },
      ]).toContainEqual(action)
    },
  )

  it('binds no key to two tools', () => {
    const keys = TOOLS.flatMap(({ tool }) => [
      ...tool.keys,
      ...(tool.cycleKey === undefined ? [] : [tool.cycleKey]),
    ])
    expect(new Set(keys).size).toBe(keys.length)
    for (const chrome of ['v', 'h', 'm']) expect(keys).not.toContain(chrome)
  })
})

/**
 * And every tool you aim before pressing says so with its OWN mark.
 *
 * This used to check the stylesheet for a `.of-canvas--<tool>` rule, because
 * the cursor was `crosshair` written out once per tool. That answered "you
 * are about to put something down" and never which thing — the same plus sign
 * for a sticky note, a table and a remark. A type's tool now declares its
 * mark (a required field, so a missing one is a compile error) and the
 * chrome's are a `Record<ChromeTool, …>`; what a type cannot catch is a chrome
 * mode given `null`, which is a deliberate "no mark" and is right for exactly
 * two of them.
 */
describe('every placing tool carries its own cursor', () => {
  const aiming = [...TOOLS.map(({ type }) => type), 'comment']

  it('finds the tools to read, so the cases below are not vacuous', () => {
    expect(aiming.length).toBeGreaterThanOrEqual(8)
  })

  it.each(aiming)('%s', (id) => {
    const cursor = cursorOf(id)
    expect(cursor, "no mark, so this tool shows somebody else's pointer").not.toBeNull()
    expect(cursor).toContain('data:image/svg+xml')
    /*
     * A KEYWORD after the image. A data URI cursor is refused outright on
     * some platforms, and a declaration with nothing to fall back to is
     * dropped whole — leaving the arrow, which says nothing about a tool
     * being armed at all.
     */
    expect(cursor).toMatch(/,\s*crosshair$/)
  })

  it("leaves the two that should keep the platform's own", () => {
    expect(cursorOf('select')).toBeNull()
    expect(cursorOf('pan')).toBeNull()
  })

  /** The rim. A single-coloured cursor vanishes into at least one board. */
  it('draws each mark twice, so it reads on any ground', () => {
    const decoded = decodeURIComponent(cursorOf('comment') ?? '')
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
      cursorOf('comment', NOTHING_CHOSEN, { ink: '#f2f5f8', halo: '#101820' }) ?? '',
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
    const seen = SHAPE_KINDS.map((kind) => cursorOf('shape', { shape: kind }))
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
      expect(
        hot - arm - rim / 2,
        'the crosshair is cut off at the top left',
      ).toBeGreaterThanOrEqual(0)
    })

    it('points where the crosshair crosses', () => {
      // A hotspot anywhere else is a cursor that aims at a different pixel
      // from the one it draws a cross on.
      const svg = decodeURIComponent(cursorOf('comment') ?? '')
      const spot = /"\)\s(\d+(?:\.\d+)?)\s(\d+(?:\.\d+)?),/.exec(cursorOf('comment') ?? '')
      expect(spot?.[1]).toBe(String(hot))
      expect(spot?.[2]).toBe(String(hot))
      // Drawn symmetrically about that point, rather than reaching further
      // one way than the other.
      expect(svg).toContain(`M${String(hot - arm)} `)
    })

    it('keeps the glyph inside the box', () => {
      expect(place + ink * scale + rim / 2, 'the glyph runs out of the cursor').toBeLessThanOrEqual(
        size,
      )
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
      const svg = decodeURIComponent(cursorOf('comment') ?? '')
      expect(svg).toContain(`stroke-width="${String(rim)}"`)
      expect(svg).toContain(`stroke-width="${String(rim / scale)}"`)
    })
  })

  /** And the geometry is the object's own, so a new kind arrives with one. */
  it('draws the variant from the same geometry the object is drawn from', () => {
    const diamond = decodeURIComponent(cursorOf('shape', { shape: 'diamond' }) ?? '')
    expect(diamond).toContain(shapePath('diamond') ?? 'no path')
  })
})

/*
 * Resize, rotate and lock had no keys (C3 #7): the only thing a keyboard could
 * do to a selection was nudge it, so everything else took a pointer — WCAG
 * 2.1.1 and 2.5.7.
 */
describe('transforming the selection without a pointer', () => {
  it.each([
    ['ArrowRight', { dw: 10, dh: 0 }],
    ['ArrowLeft', { dw: -10, dh: 0 }],
    ['ArrowDown', { dw: 0, dh: 10 }],
    ['ArrowUp', { dw: 0, dh: -10 }],
  ])('Mod+%s resizes by the grid step', (pressed, by) => {
    expect(resolveKeyAction(key(pressed, { ctrlKey: true }), TOOLS)).toEqual({
      kind: 'resize-by',
      ...by,
    })
    expect(resolveKeyAction(key(pressed, { metaKey: true }), TOOLS)).toEqual({
      kind: 'resize-by',
      ...by,
    })
  })

  it('Mod+Shift+arrow resizes by a single unit', () => {
    expect(resolveKeyAction(key('ArrowRight', { ctrlKey: true, shiftKey: true }), TOOLS)).toEqual({
      kind: 'resize-by',
      dw: 1,
      dh: 0,
    })
  })

  /*
   * Alt is the measuring key: held, it shows distances to what the pointer is
   * over. Resizing on Alt+arrow meant nudging while measuring changed the size
   * instead, so Alt+arrow moves, exactly as the arrow alone does.
   */
  it('Alt+arrow nudges, so the selection can be moved while measuring', () => {
    expect(resolveKeyAction(key('ArrowRight', { altKey: true }), TOOLS)).toEqual(
      resolveKeyAction(key('ArrowRight'), TOOLS),
    )
  })

  it.each([
    ['.', 15],
    [',', -15],
    ['>', 1],
    ['<', -1],
  ])('%s rotates by %i degrees', (pressed, degrees) => {
    const shiftKey = pressed === '>' || pressed === '<'
    expect(resolveKeyAction(key(pressed, { shiftKey }), TOOLS)).toEqual({
      kind: 'rotate-by',
      degrees,
    })
  })

  it('Mod+Shift+L locks and unlocks, and plain Mod+L is left to the browser', () => {
    expect(resolveKeyAction(key('L', { ctrlKey: true, shiftKey: true }), TOOLS)).toEqual({
      kind: 'toggle-lock',
    })
    expect(resolveKeyAction(key('l', { ctrlKey: true }), TOOLS)).toBeNull()
  })
})
