import { gridFromText, plainTextOf, richFromPlain, type RichText } from '@openframe/core'

import { spansFromElement } from '../views/rich-text-dom.js'

/** Content from outside the board, as the board will take it. */
export type OutsidePaste =
  | { readonly kind: 'text'; readonly text: RichText }
  | { readonly kind: 'grid'; readonly rows: readonly (readonly RichText[])[] }

/**
 * What a paste from another application holds, read as the board takes it: a
 * spreadsheet range as a grid, formatted words as formatted words, and
 * anything else as plain words. `plain` is Shift+Mod+V — paste the words and
 * nothing else, so even a range comes in as its text.
 *
 * Markup is READ, never inserted, exactly as the text editor reads a paste
 * (`RichTextField`): parsed into a document that is never rendered, so nothing
 * in it loads or runs, and only the characters, the four marks, sizes and
 * lists come out.
 *
 * `null` when there is nothing to paste.
 */
export function readOutside(html: string, text: string, plain: boolean): OutsidePaste | null {
  if (!plain) {
    const grid = gridFromText(text, { fromTable: /<table[\s>]/i.test(html) })
    if (grid !== null) return { kind: 'grid', rows: grid.map((row) => row.map(richFromPlain)) }
  }
  const words = readWords(html, text, plain)
  return words === null ? null : { kind: 'text', text: words }
}

/**
 * The words of a paste and nothing else, however it was shaped: formatted
 * as the document had them unless `plain`. What Paste special › As a text
 * box and As plain text make, a grid or not. `null` when there are none.
 */
export function readWords(html: string, text: string, plain: boolean): RichText | null {
  if (!plain && html !== '') {
    const spans = spansFromElement(new DOMParser().parseFromString(html, 'text/html').body)
    if (plainTextOf(spans).trim() !== '') return spans
  }
  // A copied line usually brings the newline it ended with; it is not a line.
  const words = text.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  return words.trim() === '' ? null : richFromPlain(words)
}
