import { richFromPlain, type RichText } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import {
  renderSpansInto,
  selectionOffsets,
  setSelectionOffsets,
  spansFromElement,
} from './rich-text-dom.js'

function parse(html: string): RichText {
  const host = document.createElement('div')
  host.innerHTML = html
  return spansFromElement(host)
}

/**
 * The translation between the model and the DOM.
 *
 * Everything else about the editor rests on this being right: the model is
 * authoritative and the contenteditable is a projection of it, so a faithful
 * read-back is the difference between formatting text and losing it.
 */
describe('reading formatted text out of an element', () => {
  it('reads plain text as one unmarked span', () => {
    expect(parse('hello')).toEqual(richFromPlain('hello'))
  })

  it('reads the tags a contenteditable produces', () => {
    expect(parse('a<strong>b</strong>')).toEqual([{ text: 'a' }, { text: 'b', marks: ['bold'] }])
    expect(parse('<em>b</em>')).toEqual([{ text: 'b', marks: ['italic'] }])
    expect(parse('<u>b</u>')).toEqual([{ text: 'b', marks: ['underline'] }])
    expect(parse('<s>b</s>')).toEqual([{ text: 'b', marks: ['strike'] }])
  })

  /** Browsers are not consistent about which tag they emit for bold. */
  it('reads the legacy tags too', () => {
    expect(parse('<b>x</b>')).toEqual([{ text: 'x', marks: ['bold'] }])
    expect(parse('<i>x</i>')).toEqual([{ text: 'x', marks: ['italic'] }])
    expect(parse('<strike>x</strike>')).toEqual([{ text: 'x', marks: ['strike'] }])
    expect(parse('<del>x</del>')).toEqual([{ text: 'x', marks: ['strike'] }])
  })

  it('accumulates nested marks', () => {
    expect(parse('<strong><em>x</em></strong>')).toEqual([{ text: 'x', marks: ['bold', 'italic'] }])
  })

  /**
   * Pasted markup does not use our tags. A browser copying bold text out of
   * another application hands over inline styles, and dropping them would
   * silently discard formatting the user can see on their own clipboard.
   */
  it('reads inline styles from pasted markup', () => {
    expect(parse('<span style="font-weight:bold">x</span>')).toEqual([
      { text: 'x', marks: ['bold'] },
    ])
    expect(parse('<span style="font-weight:700">x</span>')).toEqual([
      { text: 'x', marks: ['bold'] },
    ])
    expect(parse('<span style="font-style:italic">x</span>')).toEqual([
      { text: 'x', marks: ['italic'] },
    ])
    expect(parse('<span style="text-decoration:line-through">x</span>')).toEqual([
      { text: 'x', marks: ['strike'] },
    ])
  })

  it('reads a size token', () => {
    expect(parse('<span data-size="lg">x</span>')).toEqual([{ text: 'x', size: 'lg' }])
  })

  it('ignores a size it does not recognise', () => {
    expect(parse('<span data-size="enormous">x</span>')).toEqual([{ text: 'x' }])
  })

  /**
   * Enter in a contenteditable inserts a `<br>`. Without this a two-line note
   * round-trips as one line, and the user's layout is destroyed by the act of
   * editing it.
   */
  it('reads a line break as a newline', () => {
    expect(parse('a<br>b')).toEqual([{ text: 'a\nb' }])
  })

  it('merges runs that render identically', () => {
    expect(parse('<strong>a</strong><strong>b</strong>')).toEqual([{ text: 'ab', marks: ['bold'] }])
  })

  it('never returns an empty list', () => {
    expect(parse('')).toEqual([{ text: '' }])
  })

  it('is insensitive to the order marks were nested in', () => {
    expect(parse('<strong><em>x</em></strong>')).toEqual(parse('<em><strong>x</strong></em>'))
  })
})

/**
 * The other direction: model → DOM.
 *
 * Round-tripping is the property that matters. Anything that survives being
 * written and read back is safe; anything that does not is text the user loses
 * by the act of editing it.
 */
describe('writing formatted text into an element', () => {
  function roundTrip(spans: RichText): RichText {
    const host = document.createElement('div')
    renderSpansInto(host, spans)
    return spansFromElement(host)
  }

  it('round-trips plain text', () => {
    expect(roundTrip(richFromPlain('hello'))).toEqual(richFromPlain('hello'))
  })

  it('round-trips every mark', () => {
    for (const mark of ['bold', 'italic', 'underline', 'strike'] as const) {
      expect(roundTrip([{ text: 'x', marks: [mark] }])).toEqual([{ text: 'x', marks: [mark] }])
    }
  })

  /**
   * Marks come back in a canonical (sorted) order, not the order they were
   * written in. That is deliberate — marks are a SET, and a round trip that
   * preserved an arbitrary order would make two identical formattings compare
   * unequal — so the canonical order is what a stored span holds.
   */
  it('round-trips combined marks, canonically ordered', () => {
    const spans: RichText = [{ text: 'x', marks: ['bold', 'italic', 'strike', 'underline'] }]
    expect(roundTrip(spans)).toEqual(spans)
  })

  it('round-trips sizes', () => {
    expect(roundTrip([{ text: 'x', size: '5xl' }])).toEqual([{ text: 'x', size: '5xl' }])
  })

  it('round-trips a mixed run', () => {
    const spans: RichText = [
      { text: 'plain ' },
      { text: 'bold', marks: ['bold'] },
      { text: ' and ' },
      { text: 'big', size: 'lg' },
    ]
    expect(roundTrip(spans)).toEqual(spans)
  })

  /**
   * A newline is a CHARACTER, not a `<br>`: the container sets `pre-wrap`, so
   * it renders as a break and survives the trip. Emitting `<br>` here would
   * still read back as a newline, but the model would then have two ways to
   * spell one thing.
   */
  it('round-trips newlines', () => {
    expect(roundTrip([{ text: 'a\nb' }])).toEqual([{ text: 'a\nb' }])
  })

  it('replaces whatever was there rather than appending', () => {
    const host = document.createElement('div')
    renderSpansInto(host, richFromPlain('first'))
    renderSpansInto(host, richFromPlain('second'))
    expect(spansFromElement(host)).toEqual(richFromPlain('second'))
  })

  /**
   * Text goes in as a text NODE, never as markup. `innerHTML` would need
   * escaping that is correct for every input, on a document format this product
   * accepts from other people.
   */
  it('cannot be made to execute markup', () => {
    const host = document.createElement('div')
    renderSpansInto(host, richFromPlain('<img src=x onerror=alert(1)>'))
    expect(host.querySelector('img')).toBeNull()
    expect(spansFromElement(host)).toEqual(richFromPlain('<img src=x onerror=alert(1)>'))
  })
})

/**
 * Paragraphs and lists (ADR 0014).
 *
 * The editor draws each paragraph as a block and lets the browser split blocks
 * on Enter, so the reading has to understand every block spelling a browser or
 * a paste produces — and give back exactly the text that was there when nothing
 * about the paragraphs changed.
 */
describe('paragraphs and lists in an element', () => {
  const roundTrip = (text: RichText): RichText => {
    const host = document.createElement('div')
    renderSpansInto(host, text)
    return spansFromElement(host)
  }

  it('draws each paragraph as a block, a list item marked as one', () => {
    const host = document.createElement('div')
    renderSpansInto(host, [
      { text: 'plain' },
      { text: '\n' },
      { text: 'item' },
      { text: '\n', list: 'number', indent: 1 },
    ])
    const blocks = [...host.children] as HTMLElement[]
    expect(blocks.map((block) => block.textContent)).toEqual(['plain', 'item'])
    expect(blocks[1]?.dataset.list).toBe('number')
    expect(blocks[1]?.dataset.indent).toBe('1')
  })

  it.each([
    ['plain lines', [{ text: 'one\ntwo' }]],
    ['a blank line', [{ text: 'one\n\n' }]],
    ['a list that ends the text', [{ text: 'a' }, { text: '\n', list: 'bullet' }]],
    ['a list, then a blank line', [{ text: 'a' }, { text: '\n', list: 'bullet' }, { text: '\n' }]],
    [
      'a nested numbered list with marks',
      [
        { text: 'first', marks: ['bold'] },
        { text: '\n', list: 'number' },
        { text: 'inner' },
        { text: '\n', list: 'number', indent: 2 },
      ],
    ],
    [
      'two empty items',
      [
        { text: '\n', list: 'bullet' },
        { text: '\n', list: 'bullet' },
      ],
    ],
  ] as const)('round-trips %s', (_name, text) => {
    expect(roundTrip(text as RichText)).toEqual(text)
  })

  it('reads the blocks a browser makes when Enter is pressed', () => {
    expect(parse('<div>one</div><div>two</div>')).toEqual([{ text: 'one\ntwo' }])
    // The first line typed straight into the root, the next pressed into a div.
    expect(parse('one<div>two</div>')).toEqual([{ text: 'one\ntwo' }])
  })

  it('reads an empty line’s placeholder as an empty line, not two', () => {
    expect(parse('<div>one</div><div><br></div><div>two</div>')).toEqual([{ text: 'one\n\ntwo' }])
  })

  it('reads a list pasted from elsewhere as a list, nesting and all', () => {
    expect(parse('<ul><li>a</li><li>b<ol><li>c</li></ol></li></ul>')).toEqual([
      { text: 'a' },
      { text: '\n', list: 'bullet' },
      { text: 'b' },
      { text: '\n', list: 'bullet' },
      { text: 'c' },
      { text: '\n', list: 'number', indent: 1 },
    ])
  })

  it('continues a list when the browser splits an item on Enter', () => {
    // What Chrome leaves: the split block's attributes copied onto the new one.
    expect(
      parse(
        '<div class="of-p" data-list="bullet">a</div><div class="of-p" data-list="bullet">b</div>',
      ),
    ).toEqual([
      { text: 'a' },
      { text: '\n', list: 'bullet' },
      { text: 'b' },
      { text: '\n', list: 'bullet' },
    ])
  })
})

/**
 * Plain-text offsets through the blocks. A paragraph break is ONE character
 * between two paragraphs, as it is in the model; counting it as none, or as
 * two, puts every mark after the first line on the wrong words.
 */
describe('selections across paragraphs', () => {
  it('puts a caret back where it was and reads the same offsets', () => {
    const host = document.createElement('div')
    document.body.append(host)
    renderSpansInto(host, [
      { text: 'ab' },
      { text: '\n', list: 'bullet' },
      { text: 'cd' },
      { text: '\n', list: 'bullet' },
      { text: '\n' },
      { text: 'ef' },
    ])
    for (const [from, to] of [
      [0, 0],
      [1, 4],
      [3, 3],
      [6, 6],
      [4, 8],
      [0, 9],
    ] as const) {
      setSelectionOffsets(host, from, to)
      expect(selectionOffsets(host), `${String(from)}–${String(to)}`).toEqual({ from, to })
    }
    host.remove()
  })
})
