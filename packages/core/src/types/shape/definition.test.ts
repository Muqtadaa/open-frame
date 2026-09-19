import { describe, expect, it } from 'vitest'

import { richFromPlain } from '../../domain/rich-text.js'
import { createTestHarness } from '../../testing.js'
import { createDefaultRegistry } from '../index.js'
import { SHAPE_KINDS, type ShapeKind } from './schema.js'

/**
 * Which style controls a shape offers, and why it is not the same answer for
 * every kind.
 *
 * `shape` is ONE type with a kind discriminant, so the type's own
 * `capabilities.styleProps` cannot distinguish a rectangle from an ellipse.
 * Declaring a corner radius on the type and letting the ellipse ignore it is
 * exactly the trap rule 21 records: `sticky` claimed a `fill` its view
 * ignored, invisible for as long as `color` was the only property anything
 * could set.
 */
describe('which style controls a shape offers', () => {
  const registry = createDefaultRegistry()

  function shaped(kind: ShapeKind) {
    const h = createTestHarness()
    const result = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'shape', x: 0, y: 0, data: { shape: kind, text: richFromPlain('') } }],
    })
    if (!result.ok) throw result.error
    const id = result.affected[0]
    if (id === undefined) throw new Error('expected a created shape')
    const object = h.store.getDocument().objects.get(id)
    if (object === undefined) throw new Error('expected the shape in the document')
    return object
  }

  it('offers a corner radius on every kind that has corners', () => {
    for (const kind of SHAPE_KINDS) {
      if (kind === 'ellipse') continue
      expect(registry.stylePropsOf(shaped(kind))).toContain('radius')
    }
  })

  it('offers none on the ellipse, which has no corners', () => {
    expect(registry.stylePropsOf(shaped('ellipse'))).not.toContain('radius')
  })

  /** Narrowing takes ONE control away; it must not take the others with it. */
  it('leaves every other control alone on the ellipse', () => {
    const props = registry.stylePropsOf(shaped('ellipse'))

    for (const prop of ['color', 'fill', 'stroke', 'dash', 'font', 'align', 'opacity']) {
      expect(props).toContain(prop)
    }
  })

  /**
   * A type this build cannot interpret offers NOTHING rather than everything.
   * A quarantined object is a payload we could not read, and offering to
   * restyle it is offering to write into something we did not understand —
   * rule 7 from the near side.
   */
  it('offers nothing for a type this build does not know', () => {
    const unknown = { ...shaped('rectangle'), type: 'not-a-type' }

    expect(registry.stylePropsOf(unknown)).toEqual([])
  })
})
