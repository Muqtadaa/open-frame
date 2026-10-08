import { describe, expect, it } from 'vitest'

import { gridFrom, gridFromText, linesOf } from './pasted-grid.js'

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

  it('is one column when one column was copied, which its table says', () => {
    expect(gridFromText('a\nb\n', { fromTable: true })).toEqual([['a'], ['b']])
    expect(gridFromText('a\nb\n')).toBeNull()
  })

  it('is a word, not a table, when one cell was copied', () => {
    expect(gridFromText('a\n', { fromTable: true })).toBeNull()
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

/**
 * Comma-separated text, which is how a CSV file and many exports copy. Prose
 * has commas too, so a paste is only CSV when it is plainly a table: rows of
 * the same width, and commas written the way a file writes them rather than
 * the way a sentence does.
 */
describe('comma-separated values pasted as they are', () => {
  it('is rows of cells when every row is the same width', () => {
    expect(gridFromText('Who,What\nP07,Price\nP09,Shipping\n')).toEqual([
      ['Who', 'What'],
      ['P07', 'Price'],
      ['P09', 'Shipping'],
    ])
  })

  it('unwraps quoted cells, which may hold commas, quotes and newlines', () => {
    expect(
      gridFromText('Quote,Who\n"Cheap, but slow",P07\n"He said ""no""\nthen left",P09'),
    ).toEqual([
      ['Quote', 'Who'],
      ['Cheap, but slow', 'P07'],
      ['He said "no"\nthen left', 'P09'],
    ])
  })

  it('stays words when it reads like sentences', () => {
    expect(gridFromText('We met Ada, Grace and Alan.\nThen lunch, then home.')).toBeNull()
    expect(gridFromText('Red, green\nBlue, yellow')).toBeNull()
  })

  // Codex, on #98: the space has to be AFTER A COMMA, not inside a quoted cell.
  it('keeps a quoted cell that starts with a space, since no comma is followed by one', () => {
    expect(gridFromText('name,note\nAda," starts indented"')).toEqual([
      ['name', 'note'],
      ['Ada', ' starts indented'],
    ])
  })

  it('stays words on a single line, however many commas it has', () => {
    expect(gridFromText('a,b,c')).toBeNull()
  })

  it('stays words when the rows are not the same width', () => {
    expect(gridFromText('a,b\nc,d,e')).toBeNull()
  })
})

describe('a grid asked for by name', () => {
  it('reads commas when there are no tabs, and pads a short row', () => {
    expect(gridFrom('Red, green\nBlue')).toEqual([
      ['Red', 'green'],
      ['Blue', ''],
    ])
  })

  it('reads tabs when there are any', () => {
    expect(gridFrom('a, b\tc')).toEqual([['a, b', 'c']])
  })

  it('is one column when there is nothing to split on', () => {
    expect(gridFrom('one\ntwo')).toEqual([['one'], ['two']])
  })

  it('is nothing for nothing', () => {
    expect(gridFrom(' \n ')).toBeNull()
  })
})

describe('lines pasted as notes', () => {
  it('is a note per line, with list markers and blank lines left out', () => {
    expect(linesOf('- Price\n\n* Shipping\n  3. Returns \n1) Support\n• Tone\n')).toEqual([
      'Price',
      'Shipping',
      'Returns',
      'Support',
      'Tone',
    ])
  })

  // Codex, on #98: an empty item is a blank line, not a note saying "-".
  it('leaves out an empty list item', () => {
    expect(linesOf('- one\n- \n1. \n* two\n2)')).toEqual(['one', 'two'])
  })

  it('keeps a number that is not a list marker', () => {
    expect(linesOf('2024 was slow\n10x faster')).toEqual(['2024 was slow', '10x faster'])
  })
})
