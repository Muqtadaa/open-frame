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
 * A view that draws differently at another zoom says so (audit 2026-09-27).
 *
 * Every object used to subscribe to the zoom, so one wheel step re-rendered
 * every visible object on the board. Only views that declare `usesZoom` are
 * handed it now — so a view that reads it without declaring it would silently
 * stop following the zoom. Rendered at two zooms, any view whose drawing
 * changes must declare it.
 */
describe('zoom dependence', () => {
  const types = createDefaultRegistry()
  const views = createDefaultViewRegistry()
  const doc = createEmptyDocument('zoom-board' as BoardId, 'Zoom', 0)

  const draw = (type: string, zoom: number): string => {
    const definition = types.get(type)
    const view = views.get(type)
    if (definition === undefined || view === undefined) throw new Error(`no ${type}`)
    const object = instantiateObject({
      definition,
      id: 'zoom-subject' as ObjectId,
      order: 'a0' as OrderKey,
      x: 0,
      y: 0,
      createdAt: 0,
      createdBy: null,
      createdVia: 'user',
    })
    return renderToStaticMarkup(
      <view.Renderer
        object={object}
        selected={false}
        zoom={zoom}
        document={{ ...doc, objects: new Map([[object.id, object]]) }}
        assetUrl={() => ({ status: 'missing' })}
        boundsOf={(other) => ({ ...other.frame })}
      />,
    )
  }

  const listed = views.list()

  it('renders more than a handful of types, so this is not vacuous', () => {
    expect(listed.length).toBeGreaterThan(5)
  })

  /*
   * One way only: a view drawn the same at both zooms may still declare it,
   * because what depends on the zoom can be absent from a fresh object — a
   * connector's label, for one. The failure that matters is the silent one.
   */
  for (const view of listed) {
    it(`${view.type} declares usesZoom if its drawing depends on it`, () => {
      if (draw(view.type, 1) !== draw(view.type, 2)) expect(view.usesZoom).toBe(true)
    })
  }
})
