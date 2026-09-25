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
   * Types whose unset colour is the PANEL rather than a palette colour — a
   * table stands on whatever the board's panels stand on, which follows After
   * Hours, and no swatch is that. They paint a colour once one is chosen
   * (ADR 0015), and the second test below holds them to both halves: no
   * palette colour when unset, the chosen one when set.
   */
  const ON_THE_PANEL = new Set(['table'])

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
    /*
     * Every type with a surface must declare it, and every declaration there
     * is must be true — a connector declares the colour its LINE is drawn in,
     * which is what marks its line swatch.
     */
    const declared = views.get(definition.type)?.defaultColor !== undefined
    if (!definition.capabilities.styleProps.includes('color') && !declared) continue
    if (ON_THE_PANEL.has(definition.type)) continue

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

  it('draws a type on the panel until it is given a colour, and then in that colour', () => {
    for (const type of ON_THE_PANEL) {
      expect(views.get(type)?.defaultColor).toBeUndefined()
      const unset = render(type, {})
      const palette = COLOR_TOKENS.filter((token) => unset.includes(SURFACE_VARS[token]))
      expect(palette, `${type} with no colour`).toEqual([])
      for (const token of COLOR_TOKENS) {
        expect(render(type, { color: token }), `${type} in ${token}`).toContain(SURFACE_VARS[token])
      }
    }
  })
})
