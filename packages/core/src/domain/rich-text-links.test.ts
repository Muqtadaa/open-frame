import { describe, expect, it } from 'vitest'

import {
  applyLink,
  applyMark,
  applySize,
  linkOf,
  normaliseText,
  RichTextSchema,
  safeLink,
  type RichText,
} from './rich-text.js'
import { richTextToMarkdown } from './rich-text-markdown.js'

const HREF = 'https://example.com/pricing'

describe('a link is a span’s target (ADR 0021)', () => {
  it('accepts the web and mail, and nothing a browser would run', () => {
    expect(safeLink(HREF)).toBe(HREF)
    expect(safeLink('  http://example.com ')).toBe('http://example.com')
    expect(safeLink('HTTPS://Example.com/A')).toBe('https://Example.com/A')
    expect(safeLink('mailto:ada@example.com')).toBe('mailto:ada@example.com')
    for (const hostile of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<b>x</b>',
      'vbscript:x',
      'file:///etc/passwd',
      '/relative/path',
      'example.com',
      'https://',
      'https://exa mple.com',
      'https://example.com/\u0000',
      `https://example.com/${'a'.repeat(2048)}`,
    ]) {
      expect(safeLink(hostile), hostile).toBeNull()
    }
  })

  it('is refused at the boundary unless it is safe, and never on a newline', () => {
    expect(RichTextSchema.safeParse([{ text: 'pricing', link: HREF }]).success).toBe(true)
    expect(
      RichTextSchema.safeParse([{ text: 'pricing', link: 'javascript:alert(1)' }]).success,
    ).toBe(false)
    expect(RichTextSchema.safeParse([{ text: 'a\nb', link: HREF }]).success).toBe(false)
  })

  it('stores what safeLink gives, so padding never smuggles past the limit', () => {
    const stored = (link: string): string | undefined =>
      RichTextSchema.parse([{ text: 'pricing', link }])[0]?.link
    expect(stored(`  ${HREF}  `)).toBe(HREF)
    expect(stored('HTTPS://Example.com/A')).toBe('https://Example.com/A')
    const padding = ' '.repeat(3_000_000)
    expect(stored(`${padding}${HREF}${padding}`)).toBe(HREF)
  })

  it('links a range, and takes the link off again', () => {
    const text: RichText = [{ text: 'See the pricing page' }]
    const linked = applyLink(text, 8, 15, HREF)
    expect(linked).toEqual([
      { text: 'See the ' },
      { text: 'pricing', link: HREF },
      { text: ' page' },
    ])
    expect(linkOf(linked, 8, 15)).toBe(HREF)
    expect(linkOf(linked, 9, 10)).toBe(HREF)
    expect(linkOf(linked, 0, 15)).toBeUndefined()
    expect(applyLink(linked, 8, 15, undefined)).toEqual(text)
  })

  it('never merges two runs that go to different places', () => {
    expect(
      normaliseText([
        { text: 'one', link: HREF },
        { text: 'two', link: 'https://example.com/other' },
        { text: 'three', link: 'https://example.com/other' },
      ]),
    ).toEqual([
      { text: 'one', link: HREF },
      { text: 'twothree', link: 'https://example.com/other' },
    ])
  })

  it('keeps the link when a mark or a size changes', () => {
    const linked: RichText = [{ text: 'pricing', link: HREF }]
    const bold = applyMark(linked, 0, 7, 'bold', true)
    expect(bold).toEqual([{ text: 'pricing', link: HREF, marks: ['bold'] }])
    expect(applyMark(bold, 0, 7, 'bold', false)).toEqual(linked)
    expect(applySize(applySize(linked, 0, 7, 'lg'), 0, 7, undefined)).toEqual(linked)
  })

  it('exports as a Markdown link, one per run of the same target', () => {
    expect(
      richTextToMarkdown([
        { text: 'See ' },
        { text: 'the ', link: HREF },
        { text: 'pricing', link: HREF, marks: ['bold'] },
        { text: ' page' },
      ]),
    ).toBe(`See [the **pricing**](${HREF}) page`)
    expect(richTextToMarkdown([{ text: 'odd', link: 'https://example.com/a_(b)' }])).toBe(
      '[odd](https://example.com/a_\\(b\\))',
    )
    // `<` reads as a tag to an HTML-aware renderer; encoded, it is the same address.
    expect(richTextToMarkdown([{ text: 'odd', link: 'https://example.com/a<b>' }])).toBe(
      '[odd](https://example.com/a%3Cb%3E)',
    )
  })
})
