import { paragraphsOf, type Mark, type RichText, type TextSpan } from './rich-text.js'

/**
 * Rich text as Markdown, for a readout that leaves the board (ADR 0020).
 *
 * The words come first: anything in them Markdown would read as structure is
 * escaped, so a note that says "# not a heading" exports as that sentence and
 * not as a heading somebody else's document then promotes. A readout that
 * rearranged what people wrote would be worse than one that dropped their
 * formatting.
 *
 * Marks Markdown has are written (bold, italic, strike); underline has no
 * Markdown and stays as words. Size is the board's, not the document's.
 */
export function richTextToMarkdown(rich: RichText): string {
  const paragraphs = paragraphsOf(rich).filter((paragraph) =>
    paragraph.spans.some((span) => span.text.trim() !== ''),
  )
  const lines: string[] = []
  /*
   * A number per nesting level, restarted whenever anything other than a
   * deeper item comes between: "1. 2." then a paragraph then "1." again.
   */
  const numbers: number[] = []
  let previousWasItem = false

  for (const paragraph of paragraphs) {
    const words = paragraph.spans.map(inline).join('')
    if (paragraph.list === undefined) {
      if (lines.length > 0) lines.push('')
      lines.push(escapeLineStart(words))
      numbers.length = 0
      previousWasItem = false
      continue
    }
    const level = paragraph.indent ?? 0
    if (!previousWasItem && lines.length > 0) lines.push('')
    numbers.length = level + 1
    numbers[level] = paragraph.list === 'number' ? (numbers[level] ?? 0) + 1 : 0
    /*
     * Four spaces a level: inside a list Markdown reads a child item from the
     * column its parent's content starts at, which is two for "- " and three
     * for "1. ", and four satisfies both without becoming a code block.
     */
    const marker = paragraph.list === 'number' ? `${String(numbers[level])}.` : '-'
    lines.push(`${'    '.repeat(level)}${marker} ${words}`)
    previousWasItem = true
  }
  return lines.join('\n')
}

/** One line of text, escaped wherever Markdown would read structure into it. */
export function escapeMarkdown(text: string): string {
  return escapeLineStart(escapeInline(text))
}

const WRAP: readonly (readonly [Mark, string])[] = [
  ['bold', '**'],
  ['italic', '*'],
  ['strike', '~~'],
]

function inline(span: TextSpan): string {
  const escaped = escapeInline(span.text)
  const wraps = WRAP.filter(([mark]) => span.marks?.includes(mark) === true).map(
    ([, marker]) => marker,
  )
  if (wraps.length === 0 || escaped.trim() === '') return escaped
  /*
   * "a** bold **b" is not emphasis: a delimiter followed by a space cannot
   * open one. The run's own edge spaces go outside its markers.
   */
  const lead = /^\s*/.exec(escaped)?.[0] ?? ''
  const trail = /\s*$/.exec(escaped)?.[0] ?? ''
  const core = escaped.slice(lead.length, escaped.length - trail.length)
  const open = wraps.join('')
  const close = [...wraps].reverse().join('')
  return `${lead}${open}${core}${close}${trail}`
}

/** Characters that mean something anywhere in a line. */
function escapeInline(text: string): string {
  return text.replace(/[\\`*_[\]~]/g, (char) => `\\${char}`)
}

/** What means something only at the start of a line: a heading, a quote, a list. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>])/, '$1\\$2')
    .replace(/^(\s*)([-+])(\s)/, '$1\\$2$3')
    .replace(/^(\s*\d+)([.)])(\s)/, '$1\\$2$3')
}
