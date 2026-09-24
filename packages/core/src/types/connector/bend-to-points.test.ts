import { describe, expect, it } from 'vitest'

import { deserializeBoard } from '../../schema/deserialize.js'
import { createDefaultRegistry } from '../index.js'
import { bendToPoints } from './bend-to-points.js'
import type { ConnectorData } from './schema.js'
import frozen from './__fixtures__/v1-connectors.json' with { type: 'json' }

/**
 * A connector saved before a line could be held in more than one place.
 *
 * The fixture is FROZEN — a real envelope, written by the shape the build
 * actually persisted — so this keeps testing what is on people's disks rather
 * than what today's types happen to serialise. Editing it would quietly turn
 * that into the second thing.
 */
describe('a board from before waypoints', () => {
  const registry = createDefaultRegistry()

  const loaded = () => {
    const result = deserializeBoard(frozen, registry)
    if (result.status !== 'ok') throw new Error(`the board did not open: ${result.reason}`)
    return result
  }

  const dataOf = (id: string): ConnectorData => {
    const object = loaded().document.objects.get(id as never)
    if (object === undefined) throw new Error(`${id} is missing`)
    return object.data as ConnectorData
  }

  it('opens, with nothing degraded', () => {
    const result = loaded()
    expect(result.degraded).toEqual([])
    expect(result.document.objects.size).toBe(3)
  })

  it('keeps a hand-placed bend, as the first point the line is held by', () => {
    expect(dataOf('obj_bent').points).toEqual([{ along: 0.25, across: -40 }])
  })

  it.each(['obj_bend_null', 'obj_bend_absent'])('holds %s by nothing at all', (id) => {
    /*
     * Null and absent meant the same thing in v1 — which is the only reason
     * that field could be added to a shipped type without a migration. Both
     * become an empty list, not a list with a null in it.
     */
    expect(dataOf(id).points).toEqual([])
  })

})

/**
 * And the transform on its own, for the shapes a real board cannot contain
 * but a hand-edited file, a newer build or a bug can.
 */
describe('the transform itself', () => {
  it('passes anything that is not an object straight through', () => {
    expect(bendToPoints(null)).toBe(null)
    expect(bendToPoints('a connector, allegedly')).toBe('a connector, allegedly')
  })

  it('leaves a bend it does not understand exactly as it found it', () => {
    /*
     * Rather than coercing or dropping it. Inventing a point from nonsense
     * would call a guess a successful migration; leaving it lets validation
     * reject that ONE connector, which degrades to an `unknown` with its
     * payload preserved byte for byte — and the board still opens.
     */
    const nonsense = { from: {}, bend: 'halfway-ish', text: '' }
    expect(bendToPoints(nonsense)).toBe(nonsense)
    expect(bendToPoints({ bend: { along: 'a lot', across: 0 } })).toEqual({
      bend: { along: 'a lot', across: 0 },
    })
    // An infinity is not a position either, however numeric it looks.
    expect(bendToPoints({ bend: { along: Number.POSITIVE_INFINITY, across: 0 } })).toEqual({
      bend: { along: Number.POSITIVE_INFINITY, across: 0 },
    })
  })

  /*
   * Asserted on the TRANSFORM, not on a loaded board. A loaded object has
   * been through Zod, which strips keys the schema does not name — so the
   * same assertion against `dataOf(...)` passes whether the migration removes
   * the old field or leaves it sitting there. It was written that way first.
   */
  it('leaves no trace of the field it replaced', () => {
    expect(bendToPoints({ bend: { along: 0.25, across: -40 }, text: '' })).not.toHaveProperty(
      'bend',
    )
  })

  it('keeps every other field it does not know about', () => {
    expect(bendToPoints({ bend: null, text: 'hello', mystery: 7 })).toEqual({
      points: [],
      text: 'hello',
      mystery: 7,
    })
  })
})
