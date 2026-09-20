import { describe, expect, it } from 'vitest'

import { parseHexColor } from './object.js'
import { sanitizeStyle } from './style-boundary.js'

/**
 * The gate a style passes through on its way in from a file or a peer.
 *
 * It exists because a colour may now be LITERAL. A token was only ever a key
 * into a map the view owns, so an unrecognised one simply missed; a literal is
 * handed to CSS as written, which makes the difference between a value that
 * could be nonsense and a value that reaches a real element's style property.
 */
describe('sanitizeStyle', () => {
  it('keeps both kinds of colour', () => {
    expect(sanitizeStyle({ color: 'blue' })).toEqual({ color: 'blue' })
    expect(sanitizeStyle({ textColor: '#3a7bd5' })).toEqual({ textColor: '#3a7bd5' })
  })

  /**
   * The case this was written for. Every one of these is a string a peer can
   * put on the wire, and every one of them would previously have gone straight
   * into a style attribute.
   */
  it.each([
    'red; background: url(http://elsewhere/x)',
    'url(javascript:alert(1))',
    'var(--of-ink)',
    '#12',
    '#1234567',
    'rgb(0,0,0)',
    'transparent',
    '',
  ])('drops %s', (value) => {
    expect(sanitizeStyle({ color: value })).toEqual({})
    expect(sanitizeStyle({ textColor: value })).toEqual({})
  })

  it('drops a colour that is not a string at all', () => {
    expect(sanitizeStyle({ color: 12 })).toEqual({})
    expect(sanitizeStyle({ color: { toString: () => 'blue' } })).toEqual({})
    expect(sanitizeStyle({ color: null })).toEqual({})
  })

  /**
   * One bad colour must not cost the rest of the style. Losing a colour is not
   * losing work; losing the font, alignment and opacity along with it would be
   * a board that visibly broke because of one property.
   */
  it('keeps the rest of a style when one colour is refused', () => {
    expect(sanitizeStyle({ color: 'nonsense', font: 'serif', opacity: 0.5 })).toEqual({
      font: 'serif',
      opacity: 0.5,
    })
  })

  /**
   * Other tokens stay unchecked on purpose, and this says so out loud: an
   * unrecognised font is a miss in a lookup, not a value CSS ever sees.
   */
  it('leaves non-colour tokens alone, whatever they say', () => {
    expect(sanitizeStyle({ font: 'not-a-font' })).toEqual({ font: 'not-a-font' })
  })
})

describe('parseHexColor', () => {
  it('takes the three forms people write', () => {
    expect(parseHexColor('#3a7bd5')).toBe('#3a7bd5')
    expect(parseHexColor('3a7bd5')).toBe('#3a7bd5')
    expect(parseHexColor('#f00')).toBe('#ff0000')
  })

  /**
   * Case is normalised DOWN, so two spellings of one colour are one value —
   * the swatch that shows "this is selected" compares strings.
   */
  it('normalises case', () => {
    expect(parseHexColor('#FF0000')).toBe('#ff0000')
    expect(parseHexColor('  #Ff0000  ')).toBe('#ff0000')
  })

  it.each(['#12', '#12345', '#1234567', 'blue', '#gggggg', ''])('refuses %s', (input) => {
    expect(parseHexColor(input)).toBeNull()
  })
})
