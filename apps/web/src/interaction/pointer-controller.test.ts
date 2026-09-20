import { asObjectId, type ObjectId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import {
  exceedsDragThreshold,
  onDoubleClick,
  onPointerDown,
  type PointerDownContext,
} from './pointer-controller.js'

const A = asObjectId('obj_a')
const B = asObjectId('obj_b')

function ctx(overrides: Partial<PointerDownContext> = {}): PointerDownContext {
  return {
    tool: 'select',
    worldPoint: { x: 10, y: 10 },
    hitId: null,
    selection: new Set<ObjectId>(),
    tableSize: { columns: 3, rows: 3 },
    shiftKey: false,
    button: 0,
    spaceHeld: false,
    shapeKind: 'rectangle',
    ...overrides,
  }
}

/**
 * Interaction rules, tested as pure decisions.
 *
 * No DOM, no synthetic events, no rendered components — which is exactly why
 * the decision logic was kept out of the React layer in the first place.
 */
describe('pointer down', () => {
  it('pans on middle button regardless of tool', () => {
    expect(onPointerDown(ctx({ button: 1, tool: 'sticky' }))).toEqual([{ kind: 'begin-pan' }])
  })

  it('pans while space is held', () => {
    expect(onPointerDown(ctx({ spaceHeld: true }))).toEqual([{ kind: 'begin-pan' }])
  })

  it('creates a sticky at the pointer with the sticky tool', () => {
    expect(onPointerDown(ctx({ tool: 'sticky', worldPoint: { x: 4, y: 9 } }))).toEqual([
      { kind: 'create', objectType: 'sticky', at: { x: 4, y: 9 } },
    ])
  })

  it('starts a connector from the object under the pointer', () => {
    expect(onPointerDown(ctx({ tool: 'connector', hitId: A }))).toEqual([
      { kind: 'begin-connect', from: A, at: { x: 10, y: 10 } },
    ])
  })

  it('starts a connector from empty canvas as a free end', () => {
    expect(onPointerDown(ctx({ tool: 'connector' }))).toEqual([
      { kind: 'begin-connect', from: null, at: { x: 10, y: 10 } },
    ])
  })

  it('creates text with the text tool', () => {
    expect(onPointerDown(ctx({ tool: 'text', worldPoint: { x: 1, y: 2 } }))).toEqual([
      { kind: 'create', objectType: 'text', at: { x: 1, y: 2 } },
    ])
  })

  /**
   * Shapes and frames are DRAWN to size, the way they are in every graphics
   * tool. A click that does not travel still places one at the type's default
   * size, so nothing was taken away — that fallback lives in the gesture, which
   * is the only place that knows how far the pointer went.
   */
  it('carries the current variant when drawing a shape', () => {
    expect(onPointerDown(ctx({ tool: 'shape', shapeKind: 'ellipse' }))).toEqual([
      { kind: 'begin-draw', objectType: 'shape', at: { x: 10, y: 10 }, data: { shape: 'ellipse' } },
    ])
  })

  it('draws a frame to size rather than placing one', () => {
    expect(onPointerDown(ctx({ tool: 'frame' }))).toEqual([
      { kind: 'begin-draw', objectType: 'frame', at: { x: 10, y: 10 } },
    ])
  })

  /**
   * A sticky is not drawn. Every sticky is the same size on purpose — a wall of
   * notes at different sizes stops reading as a wall of notes — and a text
   * object sizes itself to what is typed into it.
   */
  it('still places the types whose size is not the user\'s to choose', () => {
    expect(onPointerDown(ctx({ tool: 'sticky' }))).toEqual([
      { kind: 'create', objectType: 'sticky', at: { x: 10, y: 10 } },
    ])
  })

  it('clears the selection and starts a marquee on empty canvas', () => {
    expect(onPointerDown(ctx())).toEqual([
      { kind: 'select', ids: [] },
      { kind: 'begin-marquee', at: { x: 10, y: 10 } },
    ])
  })

  it('preserves the selection when shift-marqueeing', () => {
    const intents = onPointerDown(ctx({ shiftKey: true }))
    expect(intents).toEqual([{ kind: 'begin-marquee', at: { x: 10, y: 10 } }])
  })

  it('selects an unselected object before dragging it', () => {
    expect(onPointerDown(ctx({ hitId: A }))).toEqual([
      { kind: 'select', ids: [A] },
      { kind: 'begin-translate', ids: [A] },
    ])
  })

  /**
   * The rule that makes multi-object drag possible without a modifier: pressing
   * on something already selected drags the WHOLE selection.
   */
  it('drags the whole selection when pressing an already-selected object', () => {
    const selection = new Set([A, B])
    const intents = onPointerDown(ctx({ hitId: A, selection }))
    expect(intents).toHaveLength(1)
    const intent = intents[0]
    expect(intent?.kind).toBe('begin-translate')
    if (intent?.kind !== 'begin-translate') return
    expect([...intent.ids].sort()).toEqual([A, B].sort())
  })

  it('toggles membership with shift instead of replacing the selection', () => {
    expect(onPointerDown(ctx({ hitId: B, selection: new Set([A]), shiftKey: true }))).toEqual([
      { kind: 'toggle-select', id: B },
    ])
  })
})

describe('double click', () => {
  it('begins editing the object under the pointer', () => {
    expect(onDoubleClick(A)).toEqual([{ kind: 'begin-edit', id: A }])
  })

  it('does nothing on empty canvas', () => {
    expect(onDoubleClick(null)).toEqual([])
  })
})

describe('drag threshold', () => {
  /**
   * Without a threshold, a click with a one-pixel tremor dispatches a move
   * command and puts an action the user never took into the undo stack.
   */
  it('ignores sub-threshold movement', () => {
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 1, y: 1 }, 1)).toBe(false)
  })

  it('reports movement past the threshold', () => {
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)).toBe(true)
  })

  it('measures in screen pixels, so zoom changes what counts as a drag', () => {
    // Two world units is below threshold at 1x but above it at 4x.
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 2, y: 0 }, 1)).toBe(false)
    expect(exceedsDragThreshold({ x: 0, y: 0 }, { x: 2, y: 0 }, 4)).toBe(true)
  })
})

/**
 * The table tool places the size that was CHOSEN, not a fixed one.
 *
 * Asserted with a non-square grid: a 3x3 is what the store already holds, so
 * a square would pass against a controller that ignored the choice entirely.
 */
describe('placing a table', () => {
  it('creates the grid the tool is set to', () => {
    const [intent] = onPointerDown(
      ctx({ tool: 'table', tableSize: { columns: 5, rows: 2 } }),
    )

    expect(intent).toEqual({
      kind: 'create',
      objectType: 'table',
      at: { x: 10, y: 10 },
      data: { columns: [1, 1, 1, 1, 1], rows: [1, 1] },
    })
  })
})
