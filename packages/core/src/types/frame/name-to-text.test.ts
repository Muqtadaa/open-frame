import { describe, expect, it } from 'vitest'

import { deserializeBoard } from '../../schema/deserialize.js'
import { createDefaultRegistry } from '../index.js'
import type { FrameData } from './schema.js'
import frozen from './__fixtures__/v1-frames.json' with { type: 'json' }

/** Frames saved while a title was a plain string. Frozen, per rule 6. */
describe('a board from before frame titles were rich text', () => {
  const registry = createDefaultRegistry()

  const nameOf = (id: string): FrameData['name'] => {
    const result = deserializeBoard(frozen, registry)
    if (result.status !== 'ok') throw new Error(`the board did not open: ${result.reason}`)
    expect(result.degraded).toEqual([])
    const object = result.document.objects.get(id as never)
    if (object === undefined) throw new Error(`${id} is missing`)
    return (object.data as FrameData).name
  }

  it('keeps a title as one unmarked span', () => {
    expect(nameOf('obj_frame')).toEqual([{ text: 'Onboarding research' }])
  })

  it('keeps an untitled frame untitled', () => {
    expect(nameOf('obj_frame_empty')).toEqual([{ text: '' }])
  })
})
