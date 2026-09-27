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

/**
 * A line in black or white is drawn in the token that stays visible.
 *
 * Black and white are the two colours that mean themselves, and each is the
 * page in one world: a white shape vanished in the notebook and a black line
 * After Hours. Strokes take `--of-line-*`, which `design-tokens.test` holds
 * at 3:1 on the page in both worlds; fills keep the colour that was chosen.
 */
describe('edges in black and white', () => {
  const types = createDefaultRegistry()
  const views = createDefaultViewRegistry()
  const doc = createEmptyDocument('edge-board' as BoardId, 'Edges', 0)

  const render = (type: string, style: Record<string, unknown>): string => {
    const definition = types.get(type)
    const view = views.get(type)
    if (definition === undefined || view === undefined) throw new Error(`no ${type}`)
    const object = instantiateObject({
      definition,
      id: 'edge-subject' as ObjectId,
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

  for (const hue of ['black', 'white'] as const) {
    it(`a ${hue} shape is outlined in the line token`, () => {
      const markup = render('shape', { color: hue })
      expect(markup).toContain(`stroke="var(--of-line-${hue})"`)
      expect(markup).toContain(`var(--of-s-${hue})`)
    })

    it(`a shape given a ${hue} outline gets the line token`, () => {
      expect(render('shape', { strokeColor: hue })).toContain(`stroke="var(--of-line-${hue})"`)
    })
  }

  it('a hue keeps its own ink', () => {
    expect(render('shape', { color: 'blue' })).toContain('stroke="var(--of-c-blue)"')
  })
})
