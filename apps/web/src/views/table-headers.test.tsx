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
 * Every column header has a name, even before anybody has typed one
 * (audit 2026-09-27).
 *
 * A new table starts with a header row and nothing in it, so a screen reader
 * met a grid of columns called nothing — and every cell below read out with
 * an empty header in front of it.
 */
describe('table column headers', () => {
  it('names an empty header by its column', () => {
    const definition = createDefaultRegistry().get('table')
    const view = createDefaultViewRegistry().get('table')
    if (definition === undefined || view === undefined) throw new Error('no table')
    const object = instantiateObject({
      definition,
      id: 'table-subject' as ObjectId,
      order: 'a0' as OrderKey,
      x: 0,
      y: 0,
      createdAt: 0,
      createdBy: null,
      createdVia: 'user',
    })
    const doc = createEmptyDocument('table-board' as BoardId, 'Tables', 0)
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(
      <view.Renderer
        object={object}
        selected={false}
        zoom={1}
        document={{ ...doc, objects: new Map([[object.id, object]]) }}
        assetUrl={() => ({ status: 'missing' })}
        boundsOf={(other) => ({ ...other.frame })}
      />,
    )

    const headers = [...host.querySelectorAll('[role="columnheader"]')]
    // Not vacuous: a fresh table has a header row, and it is empty.
    expect(headers.length).toBeGreaterThan(1)
    expect(headers.every((header) => (header.textContent ?? '').trim() === '')).toBe(true)

    expect(headers.map((header) => header.getAttribute('aria-label'))).toEqual(
      // The same names the editor's header strip gives them.
      headers.map((_, col) => `Column ${String.fromCharCode(65 + col)}`),
    )
  })
})
