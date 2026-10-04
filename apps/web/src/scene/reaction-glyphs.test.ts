import { describe, expect, it } from 'vitest'

import { emojiKey, glyphFor } from './reaction-glyphs.js'

/** Any emoji can be a reaction, stored by its code points. */
describe('a reaction’s glyph', () => {
  it('stores an emoji as its code points and reads it back', () => {
    const family = '👨‍👩‍👧'
    expect(emojiKey(family)).toBe('u-1f468-200d-1f469-200d-1f467')
    expect(glyphFor(emojiKey(family)).emoji).toBe(family)
  })

  it('counts an emoji that is on the bar as the bar’s', () => {
    expect(emojiKey('👍')).toBe('plus-one')
    expect(emojiKey('❤️')).toBe('heart')
  })

  it('shows a key it cannot read as a question mark', () => {
    expect(glyphFor('u-zzz').emoji).toBe('?')
    expect(glyphFor('sparkle-new').emoji).toBe('?')
  })
})
