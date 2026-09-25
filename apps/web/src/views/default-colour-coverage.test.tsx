import {
  COLOR_TOKENS,
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
import { COLOR_VARS, SURFACE_VARS } from '../scene/style-tokens.js'

/**
 * Every type that takes a colour says what colour a fresh one IS.
 *
 * The record panel marks the current swatch, and a new sticky was visibly
 * yellow while no swatch said so — its colour was unset, and the yellow lived
 * only in the renderer's fallback. Views now declare that fallback as
 * `defaultColor`, and this renders each one with no colour set and holds the
 * declaration to what is actually drawn — as a surface for a note, as ink for
 * a line — so the panel can never mark one colour while the board shows
 * another.
 */
describe('a fresh object is drawn in the colour its view declares', () => {
  const types = createDefaultRegistry()
  const views = createDefaultViewRegistry()
  const doc = createEmptyDocument('surface-board' as BoardId, 'Surface', 0)

  /**
   * Declares `color` and never paints it: picking a colour for a table changes
   * nothing on the board. What a table's colour should MEAN is a product
   * decision, recorded in docs/reviews/design-review.md (C3 #8). The second
   * test below fails the moment the table starts painting one, so this entry
   * cannot outlive the bug it stands for.
   */
  const UNPAINTED = new Set(['table'])

  const render = (type: string, style: Record<string, unknown>): string => {
    const definition = types.get(type)
    const view = views.get(type)
    if (definition === undefined || view === undefined) throw new Error(`no ${type}`)
    const object = instantiateObject({
      definition,
      id: 'surface-subject' as ObjectId,
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
        boundsOf={(other) => ({
          x: other.frame.x,
          y: other.frame.y,
          width: other.frame.width,
          height: other.frame.height,
        })}
      />,
    )
  }

  for (const definition of types.list()) {
    if (!definition.capabilities.styleProps.includes('color')) continue
    if (UNPAINTED.has(definition.type)) continue

    it(`${definition.type} declares the colour it is drawn in`, () => {
      const colour = views.get(definition.type)?.defaultColor
      expect(colour).toBeDefined()
      if (colour === undefined) return
      // A shape or a frame with no fill shows no surface at all; ask for one.
      const markup = render(definition.type, { fill: 'solid' })
      expect(markup.includes(SURFACE_VARS[colour]) || markup.includes(COLOR_VARS[colour])).toBe(
        true,
      )
    })
  }

  it('exempts only a type that really does not paint its colour', () => {
    for (const type of UNPAINTED) {
      const drawn = COLOR_TOKENS.some((token) =>
        [SURFACE_VARS[token], COLOR_VARS[token]].some((drawn) =>
          render(type, { color: token, fill: 'solid' }).includes(drawn),
        ),
      )
      expect(drawn).toBe(false)
    }
  })
})
