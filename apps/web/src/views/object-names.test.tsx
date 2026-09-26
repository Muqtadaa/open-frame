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
 * What an object is CALLED, to somebody who cannot see it.
 *
 * Every object is a named group, and screen readers say a group's name and
 * then read what is in it. The names carried the whole body — "Sticky note:"
 * and all six hundred characters — so every word on the board was read twice.
 * A name says what the thing is, and its record where it has one; the body is
 * read once, as the content it is.
 */
describe('object names', () => {
  const types = createDefaultRegistry()
  const views = createDefaultViewRegistry()
  const doc = createEmptyDocument('named-board' as BoardId, 'Named', 0)
  const BODY = 'Three of five participants could not find the annual price'
  const rich = [{ text: BODY }]

  const render = (
    type: string,
    data: Record<string, unknown>,
    asset: 'ready' | 'missing' = 'missing',
  ): string => {
    const definition = types.get(type)
    const view = views.get(type)
    if (definition === undefined || view === undefined) throw new Error(`no ${type}`)
    const object = instantiateObject({
      definition,
      id: 'named-subject' as ObjectId,
      order: 'a0' as OrderKey,
      x: 0,
      y: 0,
      data,
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
        assetUrl={() =>
          asset === 'ready' ? { status: 'ready', url: 'blob:picture' } : { status: 'missing' }
        }
        boundsOf={(other) => ({ ...other.frame })}
      />,
    )
  }

  const nameOf = (markup: string): string => /aria-label="([^"]*)"/.exec(markup)?.[1] ?? ''

  const texted = ['sticky', 'text', 'shape', 'evidence', 'insight', 'decision', 'task']
  for (const type of texted) {
    it(`${type} is named without repeating its body`, () => {
      const markup = render(type, { text: rich })
      expect(markup, 'the body is still there to be read').toContain(BODY)
      expect(nameOf(markup)).not.toContain(BODY)
      expect(nameOf(markup)).not.toBe('')
    })
  }

  it('a frame is named without repeating its title', () => {
    const markup = render('frame', { name: rich })
    expect(markup).toContain(BODY)
    expect(nameOf(markup)).not.toContain(BODY)
  })

  it('an image whose description was cleared is still an image, and says so', () => {
    const markup = render('image', { alt: '' }, 'ready')
    // An empty alt makes an image decoration, and assistive technology skips it.
    expect(markup).toMatch(/<img[^>]*alt="[^"]+"/)
  })

  it('an image with a description is named by it, once', () => {
    const markup = render('image', { alt: 'A checkout page' }, 'ready')
    expect(markup.split('A checkout page')).toHaveLength(2)
  })

  it("a table's cells sit in rows", () => {
    const markup = render('table', {})
    const rows = markup.match(/role="row"/g) ?? []
    expect(rows.length).toBeGreaterThan(0)
    // Every cell inside a row: none left as a direct child of the table.
    expect(markup).not.toMatch(
      /role="table"[^>]*>(<svg[^]*?<\/svg>)?<div[^>]*role="(cell|columnheader)"/,
    )
  })
})
