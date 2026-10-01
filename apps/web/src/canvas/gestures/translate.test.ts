import type { ObjectId } from '@openframe/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { framesBounds } from '../../scene/resize.js'

import { gestureBench, type GestureBench } from './gesture-bench.js'
import { translate } from './translate.js'
import { gestureAt } from './types.js'

/**
 * Dragging the selection: rule 4 (one command on release), rule 17 (snapping
 * as one unit, suspended by Cmd/Ctrl) and the drop into a frame. Each of these
 * used to be provable only by dragging in a browser.
 */
let bench: GestureBench

beforeEach(() => {
  bench = gestureBench()
})

/** Presses on `ids` at `at`, as the hook does when a drag begins on the selection. */
function pressOn(ids: readonly ObjectId[], at = { x: 150, y: 150 }) {
  bench.store().setSelection(ids)
  bench.store().beginTranslate(ids)
  const settled = bench.store()
  const prepared = translate.prepare?.(bench.ctx, settled)
  return gestureAt(bench.pointer(at), 'translate', at, settled.viewport, {
    subjects: prepared?.subjects ?? [],
    alignTargets: prepared?.alignTargets ?? [],
    startBounds: framesBounds(prepared?.subjects ?? []),
  })
}

describe('dragging the selection', () => {
  it('writes nothing while the pointer is down, and one move on release', () => {
    const note = bench.make('sticky', { x: 100, y: 100, width: 100, height: 100 })
    const before = bench.harness.store.getDocument()

    const { during } = bench.drag(translate, pressOn([note]), [
      { x: 170, y: 160 },
      { x: 220, y: 190 },
      { x: 273, y: 214 },
    ])

    expect(during.every((doc) => doc === before)).toBe(true)
    expect(bench.calls.map((call) => call.name)).toEqual(['moveObjects'])
  })

  it('takes a tremor for a click, not a move', () => {
    const note = bench.make('sticky', { x: 100, y: 100, width: 100, height: 100 })
    bench.drag(translate, pressOn([note]), [{ x: 151, y: 151 }])
    expect(bench.calls).toEqual([])
  })

  it('moves the whole selection by one snapped delta', () => {
    const a = bench.make('sticky', { x: 100, y: 100, width: 100, height: 100 })
    const b = bench.make('sticky', { x: 300, y: 100, width: 100, height: 100 })
    bench.drag(translate, pressOn([a, b]), [{ x: 223, y: 187 }])

    const [call] = bench.calls
    expect(call?.args[0]).toEqual([
      { id: a, dx: 70, dy: 40 },
      { id: b, dx: 70, dy: 40 },
    ])
  })

  it('does not snap while Cmd/Ctrl is held, and leaves the preference alone', () => {
    const note = bench.make('sticky', { x: 100, y: 100, width: 100, height: 100 })
    bench.drag(translate, pressOn([note]), [{ x: 223, y: 187 }], { ctrlKey: true })

    expect(bench.calls[0]?.args[0]).toEqual([{ id: note, dx: 73, dy: 37 }])
    expect(bench.store().snapToGrid).toBe(true)
  })

  it('lines up with a neighbour that is off the grid, rather than with the grid', () => {
    // Off-grid on purpose: on the grid the two would land in the same place
    // and the test would pass with alignment deleted (rule 17).
    bench.make('sticky', { x: 403, y: 600, width: 100, height: 100 })
    const note = bench.make('sticky', { x: 100, y: 100, width: 100, height: 100 })
    bench.drag(translate, pressOn([note]), [{ x: 451, y: 187 }])

    expect(bench.calls[0]?.args[0]).toEqual([{ id: note, dx: 303, dy: 40 }])
  })

  it('drops into the frame the pointer lets go over', () => {
    const frame = bench.make('frame', { x: 500, y: 0, width: 400, height: 400 })
    const note = bench.make('sticky', { x: 100, y: 100, width: 100, height: 100 })
    bench.drag(translate, pressOn([note]), [{ x: 650, y: 150 }])

    expect(bench.calls.map((call) => call.name)).toEqual(['moveAndReparent'])
    expect(bench.calls[0]?.args[1]).toBe(frame)
  })

  it('lifts out of a frame when let go outside it', () => {
    const frame = bench.make('frame', { x: 0, y: 0, width: 400, height: 400 })
    const note = bench.make(
      'sticky',
      { x: 100, y: 100, width: 100, height: 100 },
      {
        parentId: frame,
      },
    )
    bench.drag(translate, pressOn([note]), [{ x: 650, y: 150 }])

    expect(bench.calls.map((call) => call.name)).toEqual(['moveAndReparent'])
    expect(bench.calls[0]?.args[1]).toBeNull()
  })

  it('keeps a move within a frame a plain move', () => {
    const frame = bench.make('frame', { x: 0, y: 0, width: 600, height: 600 })
    const note = bench.make(
      'sticky',
      { x: 100, y: 100, width: 100, height: 100 },
      {
        parentId: frame,
      },
    )
    bench.drag(translate, pressOn([note]), [{ x: 250, y: 250 }])

    expect(bench.calls.map((call) => call.name)).toEqual(['moveObjects'])
  })

  it('never drops a frame into itself or into its own contents', () => {
    const frame = bench.make('frame', { x: 0, y: 0, width: 400, height: 400 })
    bench.make('frame', { x: 50, y: 50, width: 200, height: 200 }, { parentId: frame })
    // Let go over the inner frame, which travels with the outer one.
    bench.drag(translate, pressOn([frame], { x: 10, y: 10 }), [{ x: 120, y: 120 }])

    expect(bench.calls.map((call) => call.name)).toEqual(['moveObjects'])
  })
})
