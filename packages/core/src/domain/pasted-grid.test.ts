import { describe, expect, it } from 'vitest'

import { gridFromText } from './pasted-grid.js'

/**
 * What a spreadsheet puts on the clipboard as plain text, and what of it is a
 * grid. Words that merely contain a tab must stay words.
 */
describe('a range copied out of a spreadsheet', () => {
  it('is rows of cells, without the newline the last row ends with', () => {
    expect(gridFromText('Who\tWhat\nP07\tPrice\nP09\tShipping\n')).toEqual([
      ['Who', 'What'],
      ['P07', 'Price'],
      ['P09', 'Shipping'],
    ])
  })

  it('keeps empty cells, and reads Windows line endings', () => {
    expect(gridFromText('a\t\tc\r\n\tb\t\r\n')).toEqual([
      ['a', '', 'c'],
      ['', 'b', ''],
    ])
  })

  it('unwraps a quoted cell holding a newline, a tab or a quote', () => {
    expect(gridFromText('"two\nlines"\t"a\ttab"\n"say ""hi"""\tplain')).toEqual([
      ['two\nlines', 'a\ttab'],
      ['say "hi"', 'plain'],
    ])
  })

  it('keeps a quote that does not wrap the cell', () => {
    expect(gridFromText('"quoted" word\tb')).toEqual([['"quoted" word', 'b']])
  })

  it('is one row when one row was copied', () => {
    expect(gridFromText('a\tb\tc')).toEqual([['a', 'b', 'c']])
  })
})

describe('words that are not a grid', () => {
  it('have no tab', () => {
    expect(gridFromText('Pricing is hidden\nbehind a sales call')).toBeNull()
  })

  it('are code indented with tabs, whose rows differ', () => {
    expect(gridFromText('function a() {\n\treturn 1\n}')).toBeNull()
  })

  it('are a single column', () => {
    expect(gridFromText('\n\n')).toBeNull()
  })

  it('are ragged unless an HTML table came with them, which pads nothing away', () => {
    const ragged = 'a\tb\tc\nd\te'
    expect(gridFromText(ragged)).toBeNull()
    expect(gridFromText(ragged, { fromTable: true })).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ])
  })
})
