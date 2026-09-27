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
 * A photograph on the board is decoded off the main thread (audit 2026-09-27).
 *
 * Decoding a large image synchronously holds up the frame it first paints in,
 * so panning onto a board of photographs stuttered once per picture.
 */
describe('image view', () => {
  it('decodes asynchronously', () => {
    const definition = createDefaultRegistry().get('image')
    const view = createDefaultViewRegistry().get('image')
    if (definition === undefined || view === undefined) throw new Error('no image')
    const object = instantiateObject({
      definition,
      id: 'image-subject' as ObjectId,
      order: 'a0' as OrderKey,
      x: 0,
      y: 0,
      createdAt: 0,
      createdBy: null,
      createdVia: 'user',
    })
    const doc = createEmptyDocument('image-board' as BoardId, 'Images', 0)
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <view.Renderer
        object={object}
        selected={false}
        zoom={1}
        document={{ ...doc, objects: new Map([[object.id, object]]) }}
        assetUrl={() => ({ status: 'ready', url: 'blob:picture' })}
        boundsOf={(other) => ({ ...other.frame })}
      />,
    )
    const image = host.querySelector('img')
    expect(image).not.toBeNull()
    expect(image?.getAttribute('decoding')).toBe('async')
  })
})
