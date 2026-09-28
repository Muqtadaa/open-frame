import { describe, expect, it } from 'vitest'

import { asObjectId, type ObjectId } from '../domain/ids.js'
import type { ObjectStyle } from '../domain/object.js'
import { createTestHarness } from '../testing.js'

/**
 * A colour reaches CSS as written, so a command checks it (tracks A-3).
 *
 * Load and the room already dropped a colour that is not one
 * (`sanitizeStyle`); a COMMAND did not check at all. An agent could create a
 * note whose colour was `url(https://…)` — which every viewer's browser then
 * fetched — or anything else that is not a colour, and it would be drawn.
 * A command rejects rather than drops: whoever sent it is there to be told.
 */

const id = (name: string): ObjectId => asObjectId(`obj_${name}`)
const HOSTILE = ['url(https://example.com/pixel)', 'red; background: black', 'expression(1)', '#12345', 42]

function withNote() {
  const h = createTestHarness()
  const made = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ id: id('a'), type: 'sticky', x: 0, y: 0 }],
  })
  if (!made.ok) throw made.error
  return h
}

describe('colours at the command boundary', () => {
  for (const value of HOSTILE) {
    it(`CreateObjects refuses a colour of ${JSON.stringify(value)}`, () => {
      const h = createTestHarness()
      const result = h.dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [
          { id: id('b'), type: 'sticky', x: 0, y: 0, style: { color: value } as unknown as ObjectStyle },
        ],
      })
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
      expect(h.store.getObject(id('b'))).toBeUndefined()
    })

    it(`UpdateStyle refuses a colour of ${JSON.stringify(value)}`, () => {
      const h = withNote()
      const result = h.dispatcher.dispatch({
        kind: 'UpdateStyle',
        ids: [id('a')],
        style: { textColor: value } as unknown as ObjectStyle,
      })
      expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
      expect(h.store.getObject(id('a'))?.style.textColor).toBeUndefined()
    })
  }

  it('takes a token, a literal and none', () => {
    const h = withNote()
    for (const color of ['blue', '#3a7bd5'] as const) {
      expect(h.dispatcher.dispatch({ kind: 'UpdateStyle', ids: [id('a')], style: { color } }).ok).toBe(true)
      expect(h.store.getObject(id('a'))?.style.color).toBe(color)
    }
    expect(
      h.dispatcher.dispatch({
        kind: 'UpdateStyle',
        ids: [id('a')],
        style: { labelFill: 'none' } as unknown as ObjectStyle,
      }).ok,
    ).toBe(true)
  })
})
