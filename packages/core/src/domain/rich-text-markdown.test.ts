import { describe, expect, it } from 'vitest'

import { richFromPlain, type RichText } from './rich-text.js'
import { escapeMarkdown, richTextToMarkdown } from './rich-text-markdown.js'

const item = (list: 'bullet' | 'number', indent?: 1 | 2 | 3): RichText[number] => ({
  text: '\n',
  list,
  ...(indent === undefined ? {} : { indent }),
})

describe('rich text as Markdown', () => {
  it('is the words, for plain text', () => {
    expect(richTextToMarkdown(richFromPlain('Customers do not understand pricing'))).toBe(
      'Customers do not understand pricing',
    )
  })

  it('is nothing for no text', () => {
    expect(richTextToMarkdown(richFromPlain(''))).toBe('')
  })

  it('writes bold, italic and struck runs, and leaves underline as words', () => {
    expect(
      richTextToMarkdown([
        { text: 'loud', marks: ['bold'] },
        { text: ' and ' },
        { text: 'soft', marks: ['italic'] },
        { text: ' and ' },
        { text: 'gone', marks: ['strike'] },
        { text: ' and ' },
        { text: 'under', marks: ['underline'] },
      ]),
    ).toBe('**loud** and *soft* and ~~gone~~ and under')
  })

  it('keeps the spaces at a run’s edges outside its markers, where Markdown can see them', () => {
    expect(
      richTextToMarkdown([{ text: 'a' }, { text: ' bold ', marks: ['bold'] }, { text: 'b' }]),
    ).toBe('a **bold** b')
  })

  it('separates paragraphs with a blank line', () => {
    expect(richTextToMarkdown(richFromPlain('One\nTwo'))).toBe('One\n\nTwo')
  })

  it('writes lists, numbered in order, nested by indent', () => {
    const text: RichText = [
      { text: 'Shopping' },
      { text: '\n' },
      { text: 'Bread' },
      item('bullet'),
      { text: 'Rye' },
      item('bullet', 1),
      { text: 'First' },
      item('number'),
      { text: 'Second' },
      item('number'),
      { text: 'After' },
    ]
    expect(richTextToMarkdown(text)).toBe(
      'Shopping\n\n- Bread\n    - Rye\n1. First\n2. Second\n\nAfter',
    )
  })

  it('escapes what Markdown would read as structure', () => {
    expect(richTextToMarkdown(richFromPlain('# not a heading'))).toBe('\\# not a heading')
    expect(richTextToMarkdown(richFromPlain('> not a quote'))).toBe('\\> not a quote')
    expect(richTextToMarkdown(richFromPlain('- not a list'))).toBe('\\- not a list')
    expect(richTextToMarkdown(richFromPlain('1. not a list'))).toBe('1\\. not a list')
    expect(richTextToMarkdown(richFromPlain('*stars* and _bars_ and `ticks` and [links]'))).toBe(
      '\\*stars\\* and \\_bars\\_ and \\`ticks\\` and \\[links\\]',
    )
    expect(richTextToMarkdown(richFromPlain('a \\ b'))).toBe('a \\\\ b')
  })

  it('escapes inside a marked run as well', () => {
    expect(richTextToMarkdown([{ text: '2*3', marks: ['bold'] }])).toBe('**2\\*3**')
  })

  it('escapes a line on its own, for a heading or a field', () => {
    expect(escapeMarkdown('# Findings *v2*')).toBe('\\# Findings \\*v2\\*')
  })
})
