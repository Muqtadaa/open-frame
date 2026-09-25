import { describe, expect, it } from 'vitest'

import {
  applyMark,
  applySize,
  indentBy,
  listOf,
  normaliseText,
  paragraphsOf,
  plainTextOf,
  RichTextSchema,
  setList,
  spliceText,
  textFromParagraphs,
  updateParagraph,
  type ListKind,
  type RichText,
} from './rich-text.js'

/** Just what a paragraph IS, without where it happens to sit. */
const shape = (rich: RichText) =>
  paragraphsOf(rich).map((p) => ({
    text: plainTextOf(p.spans),
    ...(p.list === undefined ? {} : { list: p.list }),
    ...(p.indent === undefined ? {} : { indent: p.indent }),
  }))

describe('paragraphs (ADR 0014)', () => {
  describe('reading text written before lists existed', () => {
    it('is one plain paragraph per line', () => {
      expect(shape([{ text: 'one\ntwo' }])).toEqual([{ text: 'one' }, { text: 'two' }])
    })

    it('draws no empty paragraph after a final newline, as pre-wrap never did', () => {
      expect(shape([{ text: 'one\n' }])).toEqual([{ text: 'one' }])
    })

    it('keeps a blank line that was actually drawn', () => {
      expect(shape([{ text: 'one\n\n' }])).toEqual([{ text: 'one' }, { text: '' }])
    })

    it('reads the empty text as one empty paragraph', () => {
      expect(shape([{ text: '' }])).toEqual([{ text: '' }])
    })

    it('keeps the marks of the words, split at the lines', () => {
      const [first, second] = paragraphsOf([{ text: 'a\nb', marks: ['bold'] }])
      expect(first?.spans).toEqual([{ text: 'a', marks: ['bold'] }])
      expect(second?.spans).toEqual([{ text: 'b', marks: ['bold'] }])
    })

    it('says where each paragraph sits in the plain text', () => {
      const ranges = paragraphsOf([{ text: 'ab\ncd' }]).map((p) => [p.from, p.to])
      expect(ranges).toEqual([
        [0, 2],
        [3, 5],
      ])
    })
  })

  describe('the attributes are on the newline that ends the paragraph', () => {
    it('makes a closed paragraph a list item', () => {
      expect(shape([{ text: 'item' }, { text: '\n', list: 'bullet' }])).toEqual([
        { text: 'item', list: 'bullet' },
      ])
    })

    it('tells a list that ends the text from one followed by a blank line', () => {
      const ends: RichText = [{ text: 'item' }, { text: '\n', list: 'bullet' }]
      const blank: RichText = [{ text: 'item' }, { text: '\n', list: 'bullet' }, { text: '\n' }]
      expect(shape(ends)).toEqual([{ text: 'item', list: 'bullet' }])
      expect(shape(blank)).toEqual([{ text: 'item', list: 'bullet' }, { text: '' }])
    })
  })

  describe('one canonical spelling, both ways', () => {
    /*
     * Every list of up to three paragraphs drawn from these, which covers the
     * cases the spelling rules single out: empty, plain, listed, indented,
     * first, last and alone.
     */
    const kinds = [
      { text: '' },
      { text: 'words' },
      { text: '', list: 'bullet' as ListKind },
      { text: 'item', list: 'number' as ListKind },
      { text: 'deep', list: 'bullet' as ListKind, indent: 2 as const },
    ]
    const lists: (typeof kinds)[] = []
    for (const a of kinds) {
      lists.push([a])
      for (const b of kinds) {
        lists.push([a, b])
        for (const c of kinds) lists.push([a, b, c])
      }
    }

    it.each(lists.map((list) => [JSON.stringify(list), list] as const))(
      'paragraphs → text → paragraphs is the same paragraphs: %s',
      (_name, list) => {
        const text = textFromParagraphs(
          list.map(({ text, ...attributes }) => ({
            spans: text === '' ? [] : [{ text }],
            ...attributes,
          })),
        )
        expect(RichTextSchema.safeParse(text).success).toBe(true)
        expect(shape(text)).toEqual(list)
        // And writing it again changes nothing.
        expect(textFromParagraphs(paragraphsOf(text))).toEqual(text)
      },
    )

    it('writes plain text exactly as it was', () => {
      const text: RichText = [{ text: 'one\ntwo' }]
      expect(textFromParagraphs(paragraphsOf(text))).toEqual(text)
    })

    it('writes the empty text as the empty text', () => {
      expect(textFromParagraphs(paragraphsOf([{ text: '' }]))).toEqual([{ text: '' }])
    })
  })

  describe('making lists', () => {
    const lines: RichText = [{ text: 'one\ntwo\nthree' }]

    it('makes the paragraphs a selection touches into items', () => {
      // "ne\ntw" touches the first two lines.
      const listed = setList(lines, 1, 6, 'bullet')
      expect(shape(listed)).toEqual([
        { text: 'one', list: 'bullet' },
        { text: 'two', list: 'bullet' },
        { text: 'three' },
      ])
      expect(plainTextOf(listed)).toBe('one\ntwo\nthree')
    })

    it('counts a caret at the end of a line as on that line', () => {
      expect(shape(setList(lines, 3, 3, 'number'))[0]).toEqual({ text: 'one', list: 'number' })
    })

    it('takes items back to plain paragraphs, indent and all', () => {
      const deep = indentBy(setList(lines, 0, 0, 'bullet'), 0, 0, 1)
      expect(shape(setList(deep, 0, 0, undefined))[0]).toEqual({ text: 'one' })
    })

    it('reports a kind only when every touched paragraph shares it', () => {
      const listed = setList(lines, 0, 0, 'bullet')
      expect(listOf(listed, 0, 0)).toBe('bullet')
      expect(listOf(listed, 0, 6)).toBeUndefined()
    })

    it('nests items between the outermost level and three deep', () => {
      let text = setList(lines, 0, 0, 'bullet')
      for (let step = 0; step < 5; step++) text = indentBy(text, 0, 0, 1)
      expect(shape(text)[0]).toEqual({ text: 'one', list: 'bullet', indent: 3 })
      for (let step = 0; step < 5; step++) text = indentBy(text, 0, 0, -1)
      expect(shape(text)[0]).toEqual({ text: 'one', list: 'bullet' })
    })

    it('does not nest a plain paragraph', () => {
      expect(shape(indentBy(lines, 0, 0, 1))[0]).toEqual({ text: 'one' })
    })
  })

  describe('inline formatting leaves a list alone', () => {
    const listed: RichText = [
      { text: 'one' },
      { text: '\n', list: 'bullet' },
      { text: 'two' },
      { text: '\n', list: 'bullet' },
    ]

    it('keeps the items when a mark is put on and taken off across them', () => {
      const bold = applyMark(listed, 0, 7, 'bold', true)
      expect(shape(bold).map((p) => p.list)).toEqual(['bullet', 'bullet'])
      const plain = applyMark(bold, 0, 7, 'bold', false)
      expect(shape(plain).map((p) => p.list)).toEqual(['bullet', 'bullet'])
    })

    it('keeps the items when a size is put on and cleared across them', () => {
      const big = applySize(listed, 0, 7, 'lg')
      const back = applySize(big, 0, 7, undefined)
      expect(shape(back).map((p) => p.list)).toEqual(['bullet', 'bullet'])
    })

    it('never merges two list newlines into one span', () => {
      const empties: RichText = [
        { text: '\n', list: 'bullet' },
        { text: '\n', list: 'bullet' },
      ]
      expect(normaliseText(empties)).toHaveLength(2)
      expect(shape(empties)).toEqual([
        { text: '', list: 'bullet' },
        { text: '', list: 'bullet' },
      ])
    })
  })

  describe('the schema', () => {
    it('refuses a list on anything but a lone newline', () => {
      expect(RichTextSchema.safeParse([{ text: 'item', list: 'bullet' }]).success).toBe(false)
      expect(RichTextSchema.safeParse([{ text: 'a\n', list: 'bullet' }]).success).toBe(false)
    })

    it('refuses an indent without a list', () => {
      expect(RichTextSchema.safeParse([{ text: '\n', indent: 1 }]).success).toBe(false)
    })

    it('accepts every note written before lists existed', () => {
      expect(RichTextSchema.safeParse([{ text: 'a\nb\n', marks: ['bold'] }]).success).toBe(true)
    })
  })
})

describe('replacing a range of text', () => {
  it('inserts formatted text between the words either side', () => {
    const result = spliceText([{ text: 'ab', marks: ['bold'] }], 1, 1, [{ text: 'x' }])
    expect(result).toEqual([
      { text: 'a', marks: ['bold'] },
      { text: 'x' },
      { text: 'b', marks: ['bold'] },
    ])
  })

  it('replaces what was selected', () => {
    expect(plainTextOf(spliceText([{ text: 'hello world' }], 0, 5, [{ text: 'goodbye' }]))).toBe(
      'goodbye world',
    )
  })

  it('keeps a list item a list item when its words are replaced', () => {
    const listed: RichText = [{ text: '- one' }, { text: '\n', list: 'bullet' }]
    expect(shape(spliceText(listed, 0, 2, [{ text: '' }]))).toEqual([
      { text: 'one', list: 'bullet' },
    ])
  })
})

describe('rewriting one paragraph', () => {
  it('keeps an empty last line after a list as that line', () => {
    // "- " typed on the empty line after an item: the dash becomes the bullet.
    const typed: RichText = [
      { text: 'c' },
      { text: '\n', list: 'bullet' },
      { text: '-' },
    ]
    const index = paragraphsOf(typed).length - 1
    const result = updateParagraph(typed, index, (paragraph) => ({
      spans: spliceText(paragraph.spans, 0, 1, [{ text: '' }]),
      list: 'bullet',
    }))
    expect(shape(result)).toEqual([
      { text: 'c', list: 'bullet' },
      { text: '', list: 'bullet' },
    ])
  })
})
