import { describe, expect, it } from 'vitest'

import { asObjectId } from '../domain/ids.js'
import type { AnyOpenFrameObject } from '../domain/object.js'
import { appendParagraph, plainTextOf, richFromPlain, type RichText } from '../domain/rich-text.js'
import { createDefaultRegistry } from './index.js'
import { MAX_COLUMNS, MAX_ROWS, type TableData } from './table/schema.js'

/**
 * Content pasted from outside the board: words onto the one note or shape
 * selected, words as a text box of their own, and a spreadsheet range as a
 * table. What the web app does with a paste is ask these.
 */
const registry = createDefaultRegistry()

describe('words added to what something already says', () => {
  it('go on a line of their own', () => {
    expect(plainTextOf(appendParagraph(richFromPlain('Pricing'), richFromPlain('is hidden')))).toBe(
      'Pricing\nis hidden',
    )
  })

  it('are all of it when there was nothing', () => {
    expect(appendParagraph(richFromPlain(''), richFromPlain('Pricing'))).toEqual([
      { text: 'Pricing' },
    ])
  })

  it('leave no empty line after a list item', () => {
    const list: RichText = [{ text: 'one' }, { text: '\n', list: 'bullet' }]
    expect(plainTextOf(appendParagraph(list, richFromPlain('two')))).toBe('one\ntwo')
  })

  it('keep their formatting and what was there', () => {
    const added: RichText = [{ text: 'bold', marks: ['bold'] }]
    expect(appendParagraph([{ text: 'it', marks: ['italic'] }], added)).toEqual([
      { text: 'it', marks: ['italic'] },
      { text: '\n' },
      { text: 'bold', marks: ['bold'] },
    ])
  })

  it('are taken by a note, and not by a frame', () => {
    const of = (type: string, data: Record<string, unknown>): AnyOpenFrameObject => {
      const made = registry.require(type).create(data)
      return { id: asObjectId('o'), type, data: made.data } as unknown as AnyOpenFrameObject
    }
    const note = registry.appendedText(
      of('sticky', { text: richFromPlain('a') }),
      richFromPlain('b'),
    )
    expect(plainTextOf((note?.text ?? []) as RichText)).toBe('a\nb')
    expect(registry.appendedText(of('frame', {}), richFromPlain('b'))).toBeNull()
  })
})

describe('words pasted as a text box', () => {
  const box = (text: string) => {
    const made = registry.fromOutside({ text: richFromPlain(text) })
    if (made === null) throw new Error('expected a text box')
    return made
  }

  it('is a text box, sized on the grid', () => {
    const made = box('Pricing')
    expect(made.type).toBe('text')
    expect(made.width % 10).toBe(0)
    expect(made.height % 10).toBe(0)
  })

  it('grows taller with the words, and no wider than a line of reading', () => {
    const short = box('Pricing is hidden')
    const long = box('Pricing is hidden behind a sales call. '.repeat(20))
    expect(long.width).toBe(640)
    expect(long.height).toBeGreaterThan(short.height)
  })
})

describe('a spreadsheet range pasted as a table', () => {
  const cell = (text: string) => richFromPlain(text)
  const table = (rows: RichText[][]) => {
    const made = registry.fromOutside({ grid: rows })
    if (made === null) throw new Error('expected a table')
    return { ...made, data: made.data as unknown as TableData }
  }

  it('holds every cell, in reading order, padding a short row', () => {
    const made = table([[cell('a'), cell('b')], [cell('c')]])
    expect(made.type).toBe('table')
    expect(made.data.columns).toHaveLength(2)
    expect(made.data.rows).toHaveLength(2)
    expect(made.data.cells.map((c) => plainTextOf(c.text))).toEqual(['a', 'b', 'c', ''])
    expect(made.clipped).toBe(false)
  })

  it('leaves out what a table cannot hold, and says so', () => {
    const wide = Array.from({ length: MAX_COLUMNS + 4 }, (_, i) => cell(String(i)))
    const made = table(Array.from({ length: MAX_ROWS + 1 }, () => wide))
    expect(made.data.columns).toHaveLength(MAX_COLUMNS)
    expect(made.data.rows).toHaveLength(MAX_ROWS)
    expect(made.data.cells).toHaveLength(MAX_COLUMNS * MAX_ROWS)
    expect(made.clipped).toBe(true)
  })
})
