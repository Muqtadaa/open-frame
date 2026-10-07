import { describe, expect, it } from 'vitest'

import { deserializeBoard } from '../../schema/deserialize.js'
import { createDefaultRegistry } from '../index.js'
import type { PollData } from './schema.js'
import frozen from './__fixtures__/v1-polls.json' with { type: 'json' }

/** Polls saved before a poll knew who asked it. Frozen, per rule 6. */
describe('a board from before a poll knew who asked', () => {
  const registry = createDefaultRegistry()

  it('opens, with nobody recorded as asking', () => {
    const result = deserializeBoard(frozen, registry)
    if (result.status !== 'ok') throw new Error(`the board did not open: ${result.reason}`)
    expect(result.degraded).toEqual([])
    const poll = result.document.objects.get('obj_poll' as never)
    const data = poll?.data as PollData
    expect(data.by).toBeNull()
    expect(data.options.map((option) => option.label)).toEqual(['Cats', 'Dogs'])
  })

  it('records who asked a new one', () => {
    const by = { key: 'u_0123456789abcdef', name: 'Ada', hue: 120 }
    const made = registry.get('poll')?.create({ by })
    expect((made?.data as PollData | undefined)?.by).toEqual(by)
    expect((registry.get('poll')?.create()?.data as PollData | undefined)?.by).toBeNull()
  })
})
