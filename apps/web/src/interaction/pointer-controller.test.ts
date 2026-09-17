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

  it('creates text with the text tool', () => {
    expect(onPointerDown(ctx({ tool: 'text', worldPoint: { x: 1, y: 2 } }))).toEqual([
      { kind: 'create', objectType: 'text', at: { x: 1, y: 2 } },
    ])
  })

  it('carries the current variant when creating a shape', () => {
    expect(onPointerDown(ctx({ tool: 'shape', shapeKind: 'ellipse' }))).toEqual([
      { kind: 'create', objectType: 'shape', at: { x: 10, y: 10 }, data: { shape: 'ellipse' } },
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
