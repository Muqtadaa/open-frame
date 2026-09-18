import { describe, expect, it } from 'vitest'

import {
  applyMark,
  applySize,
  isEmptyText,
  markCovers,
  normaliseText,
  plainTextOf,
  richFromPlain,
  type RichText,
} from './rich-text.js'

const plain = richFromPlain('Customers do not understand pricing')

describe('rich text', () => {
  it('flattens to the characters, formatting dropped', () => {
    expect(plainTextOf([{ text: 'bold' }, { text: 'er', marks: ['bold'] }])).toBe('bolder')
  })

  it('treats a plain string as one unmarked span', () => {
    expect(richFromPlain('hello')).toEqual([{ text: 'hello' }])
  })

  describe('applying a mark', () => {
    it('marks exactly the range asked for', () => {
      const result = applyMark(plain, 0, 9, 'bold', true)
      expect(plainTextOf(result)).toBe(plainTextOf(plain))
      expect(result[0]).toEqual({ text: 'Customers', marks: ['bold'] })
      expect(result[1]?.marks).toBeUndefined()
    })

    it('leaves the characters untouched, always', () => {
      for (const [from, to] of [
        [0, 1],
        [3, 12],
        [10, 35],
        [0, 35],
      ]) {
        expect(plainTextOf(applyMark(plain, from ?? 0, to ?? 0, 'italic', true))).toBe(
          plainTextOf(plain),
        )
      }
    })

    it('removes a mark from part of a marked run', () => {
      const bolded = applyMark(plain, 0, 9, 'bold', true)
      const partly = applyMark(bolded, 0, 4, 'bold', false)
      expect(partly[0]).toEqual({ text: 'Cust' })
      expect(partly[1]).toEqual({ text: 'omers', marks: ['bold'] })
    })

    it('combines marks on the same run', () => {
      const both = applyMark(applyMark(plain, 0, 9, 'bold', true), 0, 9, 'italic', true)
      expect(both[0]?.marks).toEqual(['bold', 'italic'])
    })

    /**
     * Marks are a SET. `['bold','italic']` and `['italic','bold']` are the same
     * formatting, and a representation that treated them as different would
     * split spans forever as a user toggled marks back and forth.
     */
    it('is insensitive to the order marks were applied in', () => {
      const a = applyMark(applyMark(plain, 0, 9, 'bold', true), 0, 9, 'italic', true)
      const b = applyMark(applyMark(plain, 0, 9, 'italic', true), 0, 9, 'bold', true)
      expect(a).toEqual(b)
    })

    it('drops the key rather than storing an empty mark list', () => {
      const cleared = applyMark(applyMark(plain, 0, 9, 'bold', true), 0, 9, 'bold', false)
      expect(cleared).toEqual(plain)
      expect(Object.hasOwn(cleared[0] ?? {}, 'marks')).toBe(false)
    })

    it('ignores an empty or backwards range', () => {
      expect(applyMark(plain, 5, 5, 'bold', true)).toEqual(plain)
      expect(applyMark(plain, 9, 3, 'bold', true)).toEqual(plain)
    })
  })

  describe('size', () => {
    it('applies to a range and clears back to the object default', () => {
      const big = applySize(plain, 0, 9, 'large')
      expect(big[0]).toEqual({ text: 'Customers', size: 'large' })
      expect(applySize(big, 0, 9, undefined)).toEqual(plain)
    })

    it('keeps marks when size changes', () => {
      const marked = applyMark(plain, 0, 9, 'bold', true)
      expect(applySize(marked, 0, 9, 'huge')[0]).toEqual({
        text: 'Customers',
        marks: ['bold'],
        size: 'huge',
      })
    })
  })

  describe('normalising', () => {
    /**
     * Without this a note accumulates one span per keystroke, the document
     * grows without bound, and comparing two documents for equality stops
     * meaning anything.
     */
    it('merges adjacent runs that render identically', () => {
      expect(normaliseText([{ text: 'ab' }, { text: 'cd' }])).toEqual([{ text: 'abcd' }])
      expect(
        normaliseText([
          { text: 'ab', marks: ['bold'] },
          { text: 'cd', marks: ['bold'] },
        ]),
      ).toEqual([{ text: 'abcd', marks: ['bold'] }])
    })

    it('keeps runs that differ', () => {
      expect(normaliseText([{ text: 'ab' }, { text: 'cd', marks: ['bold'] }])).toHaveLength(2)
    })

    it('drops empty runs', () => {
      expect(normaliseText([{ text: '' }, { text: 'a' }, { text: '' }])).toEqual([{ text: 'a' }])
    })

    /** An empty list and one empty span would be two spellings of "no text". */
    it('never produces an empty list', () => {
      expect(normaliseText([])).toEqual([{ text: '' }])
      expect(normaliseText([{ text: '' }])).toEqual([{ text: '' }])
    })

    it('leaves the characters untouched', () => {
      const messy: RichText = [
        { text: 'a' },
        { text: 'b', marks: ['bold'] },
        { text: 'c', marks: ['bold'] },
        { text: '' },
        { text: 'd' },
      ]
      expect(plainTextOf(normaliseText(messy))).toBe('abcd')
    })
  })

  describe('what a toggle button shows', () => {
    /**
     * "Some of this is bold" must not read as bold, or pressing the button to
     * bold the rest of the selection would instead un-bold the part that
     * already was.
     */
    it('reports a mark only when it covers the whole range', () => {
      const partly = applyMark(plain, 0, 9, 'bold', true)
      expect(markCovers(partly, 0, 9, 'bold')).toBe(true)
      expect(markCovers(partly, 0, 12, 'bold')).toBe(false)
      expect(markCovers(partly, 3, 6, 'bold')).toBe(true)
    })

    it('reports nothing for an empty range', () => {
      expect(markCovers(plain, 4, 4, 'bold')).toBe(false)
    })
  })

  it('knows when there is no text', () => {
    expect(isEmptyText([{ text: '' }])).toBe(true)
    expect(isEmptyText([{ text: '', marks: ['bold'] }])).toBe(true)
    expect(isEmptyText(plain)).toBe(false)
  })

  /**
   * The property that matters most: formatting never changes the characters.
   * A bug here silently corrupts what someone wrote, which is unrecoverable in
   * a way a wrong font is not.
   */
  it('preserves the text through any sequence of operations', () => {
    let rich = richFromPlain('The quick brown fox jumps')
    const ops: [number, number][] = [
      [0, 3],
      [4, 9],
      [2, 15],
      [10, 25],
      [0, 25],
      [7, 8],
    ]
    for (const [from, to] of ops) {
      rich = applyMark(rich, from, to, 'bold', true)
      rich = applyMark(rich, from, to, 'italic', true)
      rich = applySize(rich, from, to, 'large')
      rich = applyMark(rich, from, to, 'bold', false)
      expect(plainTextOf(rich)).toBe('The quick brown fox jumps')
    }
  })
})
