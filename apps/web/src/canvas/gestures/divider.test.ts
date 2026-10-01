import { FULL_CROP, asAssetId } from '@openframe/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { beginCropDrag, crop } from './crop.js'
import { beginDividerDrag, divider } from './divider.js'
import { gestureBench, type GestureBench } from './gesture-bench.js'

/**
 * The two drags INSIDE one object: a table's divider and an image's crop grip.
 * Each is named by an attribute on the grip, turned into a change by the type,
 * and written as one command carrying both halves of what it did — or not at
 * all, when the grip was pressed and nothing changed.
 */
let bench: GestureBench

beforeEach(() => {
  bench = gestureBench()
})

/** A grip in the DOM, the way the overlay draws one. */
function grip(attribute: string, value: string): HTMLElement {
  const element = document.createElement('div')
  element.setAttribute(attribute, value)
  return element
}

describe('dragging a table divider', () => {
  let table: ReturnType<GestureBench['make']>

  beforeEach(() => {
    table = bench.make(
      'table',
      { x: 0, y: 0, width: 300, height: 120 },
      {
        data: { columns: [1, 1, 1], rows: [1, 1] },
      },
    )
    bench.store().setSelection([table])
  })

  function press(id: string, at: { x: number; y: number }) {
    const active = beginDividerDrag(
      bench.ctx,
      bench.pointer(at, { target: grip('data-divider-id', id) }),
      bench.store(),
    )
    if (active === null) throw new Error(`no divider ${id}`)
    return active
  }

  it('widens the column and grows the table, in one command, on release', () => {
    const before = bench.harness.store.getDocument()
    const { during } = bench.drag(divider, press('c0', { x: 100, y: 60 }), [
      { x: 115, y: 60 },
      { x: 130, y: 60 },
    ])

    expect(during.every((doc) => doc === before)).toBe(true)
    expect(bench.calls.map((call) => call.name)).toEqual(['resizeDivider'])
    const [id, data, frame] = bench.calls[0]?.args ?? []
    expect(id).toBe(table)
    expect(data).toHaveProperty('columns')
    expect((frame as { width: number }).width).toBeCloseTo(330)
  })

  it('reads a row divider down the table rather than across it', () => {
    bench.drag(divider, press('r0', { x: 150, y: 60 }), [{ x: 150, y: 90 }])
    const [, data, frame] = bench.calls[0]?.args ?? []
    expect(data).toHaveProperty('rows')
    expect((frame as { height: number }).height).toBeCloseTo(150)
  })

  it('commits nothing for a divider that was pressed and let go', () => {
    const active = press('c0', { x: 100, y: 60 })
    divider.commit(bench.ctx, active, bench.pointer({ x: 100, y: 60 }), bench.store())
    expect(bench.calls).toEqual([])
  })

  it('does not start from a press that is not on a divider', () => {
    expect(beginDividerDrag(bench.ctx, bench.pointer({ x: 100, y: 60 }), bench.store())).toBeNull()
  })
})

describe('dragging a crop grip', () => {
  let image: ReturnType<GestureBench['make']>

  beforeEach(() => {
    image = bench.make(
      'image',
      { x: 0, y: 0, width: 200, height: 100 },
      {
        data: {
          asset: {
            id: asAssetId('ast_test'),
            mimeType: 'image/png',
            byteSize: 1,
            locator: 'idb:ast_test',
          },
          naturalWidth: 200,
          naturalHeight: 100,
          crop: FULL_CROP,
        },
      },
    )
    bench.store().setCropping(image)
  })

  function press(handle: string, at: { x: number; y: number }) {
    const active = beginCropDrag(
      bench.ctx,
      bench.pointer(at, { target: grip('data-crop-handle', handle) }),
      bench.store(),
    )
    if (active === null) throw new Error(`no crop grip ${handle}`)
    return active
  }

  it('writes the window and the frame together, once, on release', () => {
    const before = bench.harness.store.getDocument()
    const { during } = bench.drag(crop, press('e', { x: 200, y: 50 }), [
      { x: 180, y: 50 },
      { x: 150, y: 50 },
    ])

    expect(during.every((doc) => doc === before)).toBe(true)
    expect(bench.calls.map((call) => call.name)).toEqual(['cropImage'])
    const [id, window, frame] = bench.calls[0]?.args ?? []
    expect(id).toBe(image)
    expect((window as { width: number }).width).toBeCloseTo(0.75)
    expect((frame as { width: number }).width).toBeCloseTo(150)
  })

  it('commits nothing when the grip is pulled the way a crop cannot go', () => {
    // Cropping only takes away: pulling an edge outward changes nothing, and
    // nothing changed must not become an entry in the undo stack.
    bench.drag(crop, press('e', { x: 200, y: 50 }), [{ x: 260, y: 50 }])
    expect(bench.calls).toEqual([])
  })

  it('does not start on a locked image', () => {
    bench.harness.dispatcher.dispatch({ kind: 'SetLocked', ids: [image], locked: true })
    expect(
      beginCropDrag(
        bench.ctx,
        bench.pointer({ x: 200, y: 50 }, { target: grip('data-crop-handle', 'e') }),
        bench.store(),
      ),
    ).toBeNull()
  })
})
