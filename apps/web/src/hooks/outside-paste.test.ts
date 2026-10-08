import { describe, expect, it } from 'vitest'

import { readOutside } from './outside-paste.js'

/**
 * A paste from another application, read as the board takes it. The board
 * then asks the registry what each kind becomes (`paste-outside.test.ts`).
 */
describe('a paste from another application', () => {
  it('is a grid when a spreadsheet range was copied', () => {
    expect(readOutside('<table><tr><td>a</td></tr></table>', 'a\tb\nc\td\n', false)).toEqual({
      kind: 'grid',
      rows: [
        [[{ text: 'a' }], [{ text: 'b' }]],
        [[{ text: 'c' }], [{ text: 'd' }]],
      ],
    })
  })

  it('keeps the formatting of words from a document', () => {
    expect(readOutside('<p>Pricing <b>is hidden</b></p>', 'Pricing is hidden', false)).toEqual({
      kind: 'text',
      text: [{ text: 'Pricing ' }, { text: 'is hidden', marks: ['bold'] }],
    })
  })

  it('is plain words with no markup, without the newline a copied line ends with', () => {
    expect(readOutside('', 'Pricing is hidden\r\n', false)).toEqual({
      kind: 'text',
      text: [{ text: 'Pricing is hidden' }],
    })
  })

  it('is only the words when asked plainly, even for a range', () => {
    expect(readOutside('<p><b>Pricing</b></p>', 'Pricing', true)).toEqual({
      kind: 'text',
      text: [{ text: 'Pricing' }],
    })
    expect(readOutside('', 'a\tb', true)).toEqual({ kind: 'text', text: [{ text: 'a\tb' }] })
  })

  it('runs nothing it reads', () => {
    const pasted = readOutside(
      '<img src=x onerror="window.ran = true"><script>window.ran = true</script><p>words</p>',
      'words',
      false,
    )
    expect(pasted).toEqual({ kind: 'text', text: [{ text: 'words' }] })
    expect((window as { ran?: boolean }).ran).toBeUndefined()
  })

  it('is nothing when it holds no words', () => {
    expect(readOutside('<p> </p>', '  \n', false)).toBeNull()
  })
})

describe('comma-separated values from another application', () => {
  it('is a table when it is plainly one', () => {
    expect(readOutside('', 'Who,What\nP07,Price\n', false)).toEqual({
      kind: 'grid',
      rows: [
        [[{ text: 'Who' }], [{ text: 'What' }]],
        [[{ text: 'P07' }], [{ text: 'Price' }]],
      ],
    })
  })

  it('stays words when it reads like sentences', () => {
    expect(readOutside('', 'Red, green\nBlue, yellow', false)).toEqual({
      kind: 'text',
      text: [{ text: 'Red, green\nBlue, yellow' }],
    })
  })
})
