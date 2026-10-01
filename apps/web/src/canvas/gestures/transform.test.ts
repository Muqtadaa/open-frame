import { beforeEach, describe, expect, it } from 'vitest'

import { gestureBench, type GestureBench } from './gesture-bench.js'
import { beginTransformDrag, resize, rotate } from './transform.js'

/**
 * Resize and rotate preview frames in interaction state and write ONCE, on
 * release (rule 14). What a grip does with the modifier keys is decided here,
 * and was only ever checked by dragging in a browser.
 */
let bench: GestureBench

beforeEach(() => {
  bench = gestureBench()
})

function grab(grip: string, at: { x: number; y: number }) {
  const gesture = beginTransformDrag(bench.ctx, bench.pointer(at), bench.store(), grip)
  if (gesture === null) throw new Error(`nothing to transform from ${grip}`)
  return gesture
}

function resized() {
  const [call] = bench.calls
  return (call?.args[0] as { frame: { x: number; y: number; width: number; height: number } }[])[0]
    ?.frame
}

describe('resizing the selection', () => {
  beforeEach(() => {
    const shape = bench.make('shape', { x: 100, y: 100, width: 200, height: 100 })
    bench.store().setSelection([shape])
  })

  it('writes nothing while the pointer is down, and one resize on release', () => {
    const before = bench.harness.store.getDocument()
    const { during } = bench.drag(resize, grab('se', { x: 300, y: 200 }), [
      { x: 340, y: 220 },
      { x: 400, y: 250 },
    ])
    expect(during.every((doc) => doc === before)).toBe(true)
    expect(bench.calls.map((call) => call.name)).toEqual(['resizeObjects'])
  })

  it('commits nothing for a grip that was pressed and let go', () => {
    const active = grab('se', { x: 300, y: 200 })
    resize.commit(bench.ctx, active, bench.pointer({ x: 300, y: 200 }), bench.store())
    expect(bench.calls).toEqual([])
  })

  it('keeps proportions at a corner, and lets Shift release them', () => {
    bench.drag(resize, grab('se', { x: 300, y: 200 }), [{ x: 500, y: 210 }])
    const kept = resized()
    expect((kept?.width ?? 0) / (kept?.height ?? 1)).toBeCloseTo(2)

    bench.calls.length = 0
    bench.drag(resize, grab('se', { x: 300, y: 200 }), [{ x: 500, y: 210 }], { shiftKey: true })
    expect(resized()?.width).toBeCloseTo(400)
    expect(resized()?.height).toBeCloseTo(110)
  })

  it('grows from the centre with Alt', () => {
    bench.drag(resize, grab('e', { x: 300, y: 150 }), [{ x: 350, y: 150 }], { altKey: true })
    expect(resized()?.x).toBeCloseTo(50)
    expect(resized()?.width).toBeCloseTo(300)
  })

  it('snaps to the grid unless Cmd/Ctrl is held', () => {
    bench.drag(resize, grab('e', { x: 300, y: 150 }), [{ x: 333, y: 150 }])
    expect(resized()?.width).toBeCloseTo(230)

    bench.calls.length = 0
    bench.drag(resize, grab('e', { x: 300, y: 150 }), [{ x: 333, y: 150 }], { metaKey: true })
    expect(resized()?.width).toBeCloseTo(233)
  })

  it('leaves a selected connector out of the box, so it is not stretched to the origin', () => {
    const [shape] = [...bench.store().selection]
    if (shape === undefined) throw new Error('no shape selected')
    const other = bench.make('shape', { x: 400, y: 100, width: 100, height: 100 })
    const line = bench.make(
      'connector',
      { x: 0, y: 0, width: 0, height: 0 },
      {
        data: {
          from: { kind: 'point', x: 150, y: 150 },
          to: { kind: 'point', x: 450, y: 150 },
        },
      },
    )
    bench.store().setSelection([shape, other, line])
    const active = grab('se', { x: 500, y: 200 })
    expect(active.subjects.map((s) => s.id)).not.toContain(line)
    expect(active.startBounds).toEqual({ x: 100, y: 100, width: 400, height: 100 })
  })

  it('does not start when nothing selected can be resized', () => {
    const line = bench.make(
      'connector',
      { x: 0, y: 0, width: 0, height: 0 },
      {
        data: { from: { kind: 'point', x: 0, y: 0 }, to: { kind: 'point', x: 90, y: 0 } },
      },
    )
    bench.store().setSelection([line])
    expect(
      beginTransformDrag(bench.ctx, bench.pointer({ x: 0, y: 0 }), bench.store(), 'se'),
    ).toBeNull()
  })
})

describe('rotating the selection', () => {
  beforeEach(() => {
    const shape = bench.make('shape', { x: 100, y: 100, width: 100, height: 100 })
    bench.store().setSelection([shape])
  })

  function turned() {
    const [call] = bench.calls
    return (call?.args[0] as { rotation: number }[])[0]?.rotation ?? NaN
  }

  it('writes one rotation on release, and nothing before it', () => {
    const before = bench.harness.store.getDocument()
    // The grip sits above the centre; going round to the right is a quarter turn.
    const { during } = bench.drag(rotate, grab('rotate', { x: 150, y: 50 }), [
      { x: 220, y: 80 },
      { x: 250, y: 150 },
    ])
    expect(during.every((doc) => doc === before)).toBe(true)
    expect(bench.calls.map((call) => call.name)).toEqual(['rotateObjects'])
    expect(turned()).toBeCloseTo(Math.PI / 2)
  })

  it('steps by fifteen degrees with Shift', () => {
    bench.drag(rotate, grab('rotate', { x: 150, y: 50 }), [{ x: 250, y: 133 }], {
      shiftKey: true,
    })
    const step = Math.PI / 12
    expect(turned() / step).toBeCloseTo(Math.round(turned() / step))
  })
})
