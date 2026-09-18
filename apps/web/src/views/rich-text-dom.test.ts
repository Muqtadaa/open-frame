import { richFromPlain, type RichText } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { renderSpansInto, spansFromElement } from './rich-text-dom.js'

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
    expect(parse('<strong><em>x</em></strong>')).toEqual([
      { text: 'x', marks: ['bold', 'italic'] },
    ])
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
    expect(parse('<span data-size="large">x</span>')).toEqual([{ text: 'x', size: 'large' }])
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
    expect(parse('<strong>a</strong><strong>b</strong>')).toEqual([
      { text: 'ab', marks: ['bold'] },
    ])
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
    expect(roundTrip([{ text: 'x', size: 'huge' }])).toEqual([{ text: 'x', size: 'huge' }])
  })

  it('round-trips a mixed run', () => {
    const spans: RichText = [
      { text: 'plain ' },
      { text: 'bold', marks: ['bold'] },
      { text: ' and ' },
      { text: 'big', size: 'large' },
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
