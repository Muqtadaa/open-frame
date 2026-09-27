import {
  createDefaultRegistry,
  createEmptyDocument,
  instantiateObject,
  type BoardId,
  type ObjectId,
  type OrderKey,
} from '@openframe/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createDefaultViewRegistry } from './index.js'
import { FRAME_PAPER } from '../scene/style-tokens.js'

/**
 * A typed note says what it is, in words.
 *
 * Colour was the only signal a slip carried about its type, and it failed
 * three ways: a freshly promoted evidence slip was pixel-identical to a gray
 * sticky, two types shared one default, and re-colouring a slip erased its
 * type altogether. The word in the record band survives all three; distinct
 * defaults keep the colour a useful second signal rather than a misleading one.
 */
describe('typed notes', () => {
  const types = createDefaultRegistry()
  const views = createDefaultViewRegistry()
  const doc = createEmptyDocument('typed-board' as BoardId, 'Typed', 0)

  const render = (type: string, style: Record<string, unknown> = {}): string => {
    const definition = types.get(type)
    const view = views.get(type)
    if (definition === undefined || view === undefined) throw new Error(`no ${type}`)
    const object = instantiateObject({
      definition,
      id: 'typed-subject' as ObjectId,
      order: 'a0' as OrderKey,
      x: 0,
      y: 0,
      style,
      createdAt: 0,
      createdBy: null,
      createdVia: 'user',
    })
    return renderToStaticMarkup(
      <view.Renderer
        object={object}
        selected={false}
        zoom={1}
        document={{ ...doc, objects: new Map([[object.id, object]]) }}
        assetUrl={() => ({ status: 'missing' })}
        boundsOf={(other) => ({ ...other.frame })}
      />,
    )
  }

  /** Every type drawn as a slip, the plain note included. */
  const slips = types
    .list()
    .map((definition) => definition.type)
    // A relation is an edge between records and draws nothing of its own.
    .filter((type) => views.get(type) !== undefined)
    .filter((type) => /class="of-(slip|sticky)\b/.test(render(type)))
  /** The slips that carry a record: everything but the plain note. */
  const typed = slips.filter((type) => (types.get(type)?.fields ?? []).length > 0)

  it('finds the slips it is about', () => {
    expect(slips).toContain('sticky')
    expect(typed).toContain('evidence')
    expect(typed).toContain('journey-stage')
    expect(typed).not.toContain('sticky')
  })

  for (const type of typed) {
    it(`an empty ${type} names its type in the record band`, () => {
      const word = type.replace(/-/g, ' ')
      expect(render(type)).toMatch(new RegExp(`class="of-slip__type"[^>]*>${word}<`))
    })

    it(`${type} in another colour still names its type`, () => {
      expect(render(type, { color: 'brown' })).toContain('class="of-slip__type"')
    })
  }

  it('no two slips share a default colour', () => {
    const defaults = slips.map((type) => views.get(type)?.defaultColor)
    expect(
      new Set(defaults).size,
      JSON.stringify(Object.fromEntries(slips.map((t, i) => [t, defaults[i]]))),
    ).toBe(slips.length)
  })

  /*
   * A frame is the place things sit, so its fill must never be what something
   * sitting on it is drawn in. It is the world's paper, which no palette
   * colour is, and no other type lays itself on.
   */
  it("a frame's fill is not any other type's default", () => {
    expect(views.get('frame')?.defaultColor).toBeUndefined()
    expect(render('frame')).toContain(FRAME_PAPER)
    for (const definition of types.list()) {
      if (definition.type === 'frame' || views.get(definition.type) === undefined) continue
      expect(render(definition.type), definition.type).not.toContain(FRAME_PAPER)
    }
  })

  it('every typed note can be reached from a note, by promotion or derivation', () => {
    const reachable = new Set<string>(['sticky'])
    for (let grew = true; grew;) {
      grew = false
      for (const from of [...reachable]) {
        const definition = types.get(from)
        const next = [
          ...(definition?.promotions ?? []),
          ...(definition?.derivations ?? []).map((derivation) => derivation.type),
        ]
        for (const type of next) {
          if (!reachable.has(type)) {
            reachable.add(type)
            grew = true
          }
        }
      }
    }
    expect(typed.filter((type) => !reachable.has(type))).toEqual([])
  })
})
