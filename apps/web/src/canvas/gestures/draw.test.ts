import { beforeEach, describe, expect, it } from 'vitest'

import { draw } from './draw.js'
import { MADE, gestureBench, type GestureBench } from './gesture-bench.js'
import { marquee } from './marquee.js'
import { pan } from './pan.js'
import { gestureAt } from './types.js'

/**
 * The three modes that start from empty board: sweeping out a new object,
 * sweeping a selection box, and dragging the board itself. None of them may
 * write anything until — and, for two of them, even at — the release.
 */
let bench: GestureBench

beforeEach(() => {
  bench = gestureBench()
})

function sweep(mode: 'draw' | 'marquee' | 'pan', at: { x: number; y: number }) {
  return gestureAt(bench.pointer(at), mode, at, bench.store().viewport)
}

describe('drawing a new object', () => {
  function start(at = { x: 100, y: 100 }) {
    bench.store().setTool('shape')
    bench.store().beginDraw('shape', at, { kind: 'rectangle' })
    return sweep('draw', at)
  }

  it('makes one object the size swept out, snapped to the grid', () => {
    const before = bench.harness.store.getDocument()
    const { during } = bench.drag(draw, start(), [
      { x: 150, y: 140 },
      { x: 243, y: 187 },
    ])
    expect(during.every((doc) => doc === before)).toBe(true)
    expect(bench.calls).toEqual([
      {
        name: 'createObjectInRect',
        args: ['shape', { x: 100, y: 100, width: 140, height: 90 }, { kind: 'rectangle' }],
      },
    ])
  })

  it('takes a sweep too small to be a drag for a click, and places the default size', () => {
    bench.drag(draw, start(), [{ x: 104, y: 103 }])
    expect(bench.calls).toEqual([
      { name: 'createObject', args: ['shape', { x: 100, y: 100 }, { kind: 'rectangle' }] },
    ])
  })

  it('reads Shift on every frame, so a square can be decided halfway', () => {
    const active = start()
    draw.move(
      bench.ctx,
      active,
      bench.pointer({ x: 200, y: 150 }),
      { x: 200, y: 150 },
      bench.store(),
    )
    bench.drag(draw, active, [{ x: 300, y: 160 }], { shiftKey: true })
    const rect = bench.calls[0]?.args[1] as { width: number; height: number }
    expect(rect.width).toBe(rect.height)
  })

  it('selects what it made, opens it for naming, and puts the select tool back', () => {
    bench.drag(draw, start(), [{ x: 200, y: 200 }])
    expect([...bench.store().selection]).toEqual([MADE])
    expect(bench.store().editingId).toBe(MADE)
    expect(bench.store().tool).toBe('select')
  })
})

describe('sweeping a selection box', () => {
  it('selects what the box touches, and writes nothing', () => {
    const inside = bench.make('sticky', { x: 100, y: 100, width: 100, height: 100 })
    bench.make('sticky', { x: 600, y: 600, width: 100, height: 100 })
    bench.store().beginMarquee({ x: 50, y: 50 })
    const before = bench.harness.store.getDocument()

    bench.drag(marquee, sweep('marquee', { x: 50, y: 50 }), [{ x: 250, y: 250 }])

    expect([...bench.store().selection]).toEqual([inside])
    expect(bench.calls).toEqual([])
    expect(bench.harness.store.getDocument()).toBe(before)
  })

  it('adds to the selection with Shift, without listing anything twice', () => {
    const kept = bench.make('sticky', { x: 600, y: 600, width: 100, height: 100 })
    const swept = bench.make('sticky', { x: 100, y: 100, width: 100, height: 100 })
    bench.store().setSelection([kept, swept])
    bench.store().beginMarquee({ x: 50, y: 50 })

    bench.drag(marquee, sweep('marquee', { x: 50, y: 50 }), [{ x: 250, y: 250 }], {
      shiftKey: true,
    })

    expect([...bench.store().selection]).toEqual([kept, swept])
  })
})

describe('dragging the board', () => {
  it('moves the camera from where the press began, and writes nothing', () => {
    bench.store().beginPan()
    const before = bench.harness.store.getDocument()

    bench.drag(pan, sweep('pan', { x: 100, y: 100 }), [
      { x: 130, y: 90 },
      { x: 160, y: 80 },
    ])

    // The camera moves against the hand: dragging the board right shows what lies left.
    expect(bench.store().viewport).toEqual({ x: -60, y: 20, zoom: 1 })
    expect(bench.calls).toEqual([])
    expect(bench.harness.store.getDocument()).toBe(before)
  })
})
