import { asObjectId } from '@openframe/core'
import { createTestHarness } from '@openframe/core/testing'
import { describe, expect, it } from 'vitest'

import { pasteOrigin } from './paste.js'

/**
 * A paste at the pointer puts the top-left of what it creates there, so the
 * origin has to be measured on what creation reproduces. `CreateObjects`
 * does not carry rotation, so a turned object is pasted upright — and
 * measuring its turned envelope put a 45° square about 20px right of and
 * below the pointer (Codex, on #18).
 */
describe('where a paste is measured from', () => {
  it('measures a turned object by the upright frame the paste creates', () => {
    const h = createTestHarness()
    const note = asObjectId('obj_shape')
    const made = h.dispatcher.transact('Make', [
      {
        kind: 'CreateObjects',
        objects: [{ id: note, type: 'shape', x: 100, y: 100, width: 100, height: 100 }],
      },
      { kind: 'RotateObjects', rotations: [{ id: note, rotation: Math.PI / 4 }] },
    ])
    if (!made.ok) throw made.error
    const turned = h.store.getObject(note)
    if (turned === undefined) throw new Error('no shape')
    expect(turned.frame.rotation).not.toBe(0)

    const origin = pasteOrigin([turned], h.registry, h.store.getDocument())
    expect(origin.x).toBeCloseTo(100)
    expect(origin.y).toBeCloseTo(100)
  })
})
