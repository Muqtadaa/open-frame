import { type ZodType, z } from 'zod'

/**
 * Inline formatting, as a closed set.
 *
 * Adding one is a schema change and a migration concern, which is the intended
 * friction: a mark the renderer does not know is a mark that silently does
 * nothing, and "a capability nothing in the UI consumes is untested" is the
 * class of bug this project has already shipped once (rule 21).
 */
export const MARKS = ['bold', 'italic', 'underline', 'strike'] as const
export type Mark = (typeof MARKS)[number]

/**
 * Size as a TOKEN, never a number.
 *
 * A board where every note carries an arbitrary point size stops being a board
 * and becomes a document. Tokens also keep theming possible, keep documents
 * small, and keep "make this bigger" expressible by an AI command — the same
 * reasoning as every other style token.
 *
 * Nine steps spanning 0.6× to 7.6×, a √2 progression. The first ladder ran
 * 0.8× to 1.9× and was designed when every shape was the same 160×120;
 * draw-to-size made a shape any size someone cares to draw, and on a large one
 * the largest token still read as small type in a big box. A scale this wide
 * needs numbered names — there is no honest word after "huge".
 *
 * ORDER IS THE LADDER: A− and A+ step through this array, so it must stay
 * sorted from smallest to largest.
 *
 * `md` is the object's own size and is stored as NO size at all, so a span
 * carrying it would be a second way to say the default. It is in the list
 * because stepping has to pass through it.
 */
export const SIZE_TOKENS = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'] as const

/** The size a span with no token of its own renders at. */
export const DEFAULT_SIZE = 'md' satisfies SizeToken
export type SizeToken = (typeof SIZE_TOKENS)[number]

/**
 * What a paragraph is, when it is more than a paragraph (ADR 0014).
 *
 * Carried by the NEWLINE that ends the paragraph — a `Y.Text` delta's block
 * attribute — so text that has none is exactly the text it always was.
 */
export const LIST_KINDS = ['bullet', 'number'] as const
export type ListKind = (typeof LIST_KINDS)[number]

/** How far a list item is nested. Absent is the outermost level. */
export const INDENTS = [1, 2, 3] as const
export type Indent = (typeof INDENTS)[number]

/** One run of characters that share their formatting. */
export interface TextSpan {
  readonly text: string
  /*
   * `| undefined` as well as optional, because `exactOptionalPropertyTypes` is
   * on and Zod's inferred output types an absent key as `T | undefined`. Saying
   * both is what lets the schema and the interface be the same type.
   */
  readonly marks?: readonly Mark[] | undefined
  readonly size?: SizeToken | undefined
  /** Only on a span that is exactly one newline: the paragraph it ends is a list item. */
  readonly list?: ListKind | undefined
  /** Only with `list`. */
  readonly indent?: Indent | undefined
}

/**
 * An object's text: an ordered list of formatted runs (ADR 0012).
 *
 * Deliberately the shape of a Yjs `Y.Text` delta, so the collaboration adapter
 * maps one onto the other without either side learning about the other. Offsets
 * into a plain string were rejected because another person's insertion shifts
 * every mark after it, silently bolding the wrong words.
 */
export type RichText = readonly TextSpan[]

export const TextSpanSchema: ZodType<TextSpan> = z
  .object({
    text: z.string(),
    marks: z.array(z.enum(MARKS)).optional(),
    size: z.enum(SIZE_TOKENS).optional(),
    list: z.enum(LIST_KINDS).optional(),
    indent: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  })
  .strict()
  .superRefine((span, context) => {
    /*
     * A paragraph's attributes belong to the newline that ends it and to
     * nothing else. `list` on a run of words would be a second place a list
     * could live, and one the renderer would have to guess the meaning of.
     */
    if (span.list !== undefined && span.text !== '\n') {
      context.addIssue({ code: 'custom', message: 'only a lone newline can end a list item' })
    }
    if (span.indent !== undefined && span.list === undefined) {
      context.addIssue({ code: 'custom', message: 'indent is a list item\'s, and needs `list`' })
    }
  })

/**
 * At least one span, always.
 *
 * An empty list and a list holding one empty span would be two spellings of
 * "no text", and every consumer would have to handle both.
 */
export const RichTextSchema: ZodType<RichText> = z.union([
  z.array(TextSpanSchema).min(1),
  /*
   * A plain string is unformatted text, and is accepted AS that at the
   * boundary. An agent naming a frame writes `"name": "Findings"`, and so does
   * a script against the API; refusing it would make every caller learn the
   * span format to say something with no formatting in it. What is stored is
   * always the list — `validate` returns the parsed value and every write path
   * keeps that, never what it was handed.
   */
  z.string().transform((text): RichText => [{ text }]),
])

/** The characters, with the formatting dropped. Never stored — always derived. */
export function plainTextOf(rich: RichText): string {
  return rich.map((span) => span.text).join('')
}

/** A plain string as unformatted rich text. The migration from every old type. */
export function richFromPlain(text: string): RichText {
  return [{ text }]
}

export function isEmptyText(rich: RichText): boolean {
  return plainTextOf(rich) === ''
}

/**
 * Two spans are compatible when they would render identically.
 *
 * Marks are compared as SETS: `['bold','italic']` and `['italic','bold']` are
 * the same formatting, and a representation that treated them as different
 * would split spans forever as a user toggled marks back and forth.
 */
function sameFormatting(a: TextSpan, b: TextSpan): boolean {
  /*
   * A newline carrying a paragraph's attributes is never merged into anything,
   * not even an identical one: two empty bullets in a row are two newlines, and
   * merging them would make a span of two characters claim to end a list item.
   */
  if (a.list !== undefined || b.list !== undefined) return false
  if (a.size !== b.size) return false
  const marksA = [...(a.marks ?? [])].sort()
  const marksB = [...(b.marks ?? [])].sort()
  return marksA.length === marksB.length && marksA.every((m, i) => m === marksB[i])
}

/**
 * Merges adjacent spans that render identically and drops empty ones.
 *
 * Applied after every edit. Without it a note accumulates one span per
 * keystroke, the document grows without bound, and comparing two documents for
 * equality stops meaning anything.
 */
export function normaliseText(rich: RichText): RichText {
  const out: TextSpan[] = []
  for (const span of rich) {
    if (span.text === '') continue
    const last = out[out.length - 1]
    if (last !== undefined && sameFormatting(last, span)) {
      out[out.length - 1] = { ...last, text: last.text + span.text }
      continue
    }
    out.push(span)
  }
  // Never an empty list — see RichTextSchema.
  return out.length === 0 ? [{ text: '' }] : out
}

/** Splits the run list at a plain-text offset, keeping formatting on both sides. */
function splitAt(rich: RichText, offset: number): TextSpan[] {
  const out: TextSpan[] = []
  let seen = 0
  for (const span of rich) {
    const end = seen + span.text.length
    if (offset > seen && offset < end) {
      out.push({ ...span, text: span.text.slice(0, offset - seen) })
      out.push({ ...span, text: span.text.slice(offset - seen) })
    } else {
      out.push(span)
    }
    seen = end
  }
  return out
}

function withMark(span: TextSpan, mark: Mark, on: boolean): TextSpan {
  const marks = new Set(span.marks ?? [])
  if (on) marks.add(mark)
  else marks.delete(mark)
  const next = [...marks].sort()
  // The key is omitted rather than set to `[]`, so an unformatted span has one
  // representation and documents do not carry empty arrays forever.
  return next.length === 0
    ? { text: span.text, ...sizeOf(span), ...blockOf(span) }
    : { ...span, marks: next }
}

function sizeOf(span: TextSpan): { size?: SizeToken } {
  return span.size === undefined ? {} : { size: span.size }
}

/** A newline's paragraph attributes, which clearing a mark or a size must keep. */
function blockOf(span: TextSpan): { list?: ListKind; indent?: Indent } {
  return {
    ...(span.list === undefined ? {} : { list: span.list }),
    ...(span.indent === undefined ? {} : { indent: span.indent }),
  }
}

/**
 * Turns a mark on or off across a plain-text range.
 *
 * The range is given in PLAIN-TEXT offsets because that is what a selection in
 * the editor is, and converting at this boundary keeps every caller from having
 * to know how the runs happen to be divided.
 */
export function applyMark(
  rich: RichText,
  from: number,
  to: number,
  mark: Mark,
  on: boolean,
): RichText {
  if (to <= from) return rich
  const split = splitAt(splitAt(rich, from), to)
  let seen = 0
  return normaliseText(
    split.map((span) => {
      const start = seen
      seen += span.text.length
      return start >= from && start < to ? withMark(span, mark, on) : span
    }),
  )
}

/** The same, for size. `undefined` clears back to the object's own default. */
export function applySize(
  rich: RichText,
  from: number,
  to: number,
  size: SizeToken | undefined,
): RichText {
  if (to <= from) return rich
  const split = splitAt(splitAt(rich, from), to)
  let seen = 0
  return normaliseText(
    split.map((span) => {
      const start = seen
      seen += span.text.length
      if (start < from || start >= to) return span
      return size === undefined
        ? {
            text: span.text,
            ...(span.marks === undefined ? {} : { marks: span.marks }),
            ...blockOf(span),
          }
        : { ...span, size }
    }),
  )
}

/**
 * Whether a mark covers an ENTIRE range, which is what a toggle button reflects.
 *
 * "Some of this is bold" must not read as bold, or pressing the button to bold
 * the rest of the selection would instead un-bold the part that already was.
 */
export function markCovers(rich: RichText, from: number, to: number, mark: Mark): boolean {
  if (to <= from) return false
  let seen = 0
  for (const span of rich) {
    const start = seen
    const end = seen + span.text.length
    seen = end
    if (end <= from || start >= to) continue
    if (!(span.marks ?? []).includes(mark)) return false
  }
  return true
}

/**
 * One paragraph: its runs (without the newline that ends it), what kind of
 * paragraph it is, and where its characters sit in the plain text.
 */
export interface Paragraph {
  readonly spans: readonly TextSpan[]
  readonly list?: ListKind | undefined
  readonly indent?: Indent | undefined
  /** Plain-text offset of its first character. */
  readonly from: number
  /** Plain-text offset just past its last character, before its newline. */
  readonly to: number
}

/**
 * The text as paragraphs (ADR 0014).
 *
 * Each paragraph takes the attributes of the newline that closes it. A text
 * that ENDS in a newline has no empty paragraph after it — that newline closed
 * the last one — which is also what a `pre-wrap` note always drew.
 */
export function paragraphsOf(rich: RichText): Paragraph[] {
  const out: Paragraph[] = []
  let spans: TextSpan[] = []
  let start = 0
  let at = 0
  let closedLast = false
  const close = (attributes: { list?: ListKind; indent?: Indent }): void => {
    out.push({ spans, ...attributes, from: start, to: at })
    at += 1
    start = at
    spans = []
    closedLast = true
  }
  for (const span of rich) {
    if (span.text === '') continue
    if (span.text === '\n') {
      close(blockOf(span))
      continue
    }
    const pieces = span.text.split('\n')
    pieces.forEach((piece, index) => {
      if (index > 0) close({})
      if (piece === '') return
      const { list: _list, indent: _indent, ...formatting } = span
      spans.push({ ...formatting, text: piece })
      at += piece.length
      closedLast = false
    })
  }
  if (!closedLast || out.length === 0) out.push({ spans, from: start, to: at })
  return out
}

/**
 * Paragraphs back into text, in the one canonical spelling (ADR 0014).
 *
 * Every paragraph is closed by a newline carrying its attributes, except that
 * the last one's is left off when it is plain and not empty — so plain text is
 * exactly the text it always was — and a lone empty paragraph is `''`.
 */
export function textFromParagraphs(
  paragraphs: readonly Pick<Paragraph, 'spans' | 'list' | 'indent'>[],
): RichText {
  const spans: TextSpan[] = []
  paragraphs.forEach((paragraph, index) => {
    spans.push(...paragraph.spans)
    const last = index === paragraphs.length - 1
    const empty = paragraph.spans.every((span) => span.text === '')
    const plain = paragraph.list === undefined
    if (last && plain && (!empty || paragraphs.length === 1)) return
    spans.push({
      text: '\n',
      ...(paragraph.list === undefined ? {} : { list: paragraph.list }),
      ...(paragraph.list === undefined || paragraph.indent === undefined
        ? {}
        : { indent: paragraph.indent }),
    })
  })
  return normaliseText(spans)
}

/**
 * The paragraphs a selection touches.
 *
 * Inclusive at both ends, so a caret sitting at the end of a line — the usual
 * place to press "bullet" — belongs to that line.
 */
function touched(paragraph: Paragraph, from: number, to: number): boolean {
  return paragraph.from <= to && paragraph.to >= from
}

/** Makes every touched paragraph a list item of this kind, or plain with `undefined`. */
export function setList(
  rich: RichText,
  from: number,
  to: number,
  list: ListKind | undefined,
): RichText {
  return textFromParagraphs(
    paragraphsOf(rich).map((paragraph) => {
      if (!touched(paragraph, from, to)) return paragraph
      if (list === undefined) return { spans: paragraph.spans }
      return { ...paragraph, list }
    }),
  )
}

/**
 * The list kind a selection is, if every paragraph it touches shares one —
 * which is what a list button shows, for the reason `markCovers` gives.
 */
export function listOf(rich: RichText, from: number, to: number): ListKind | undefined {
  const lists = paragraphsOf(rich)
    .filter((paragraph) => touched(paragraph, from, to))
    .map((paragraph) => paragraph.list)
  const first = lists[0]
  return first !== undefined && lists.every((list) => list === first) ? first : undefined
}

/** Nests the touched list items one level deeper or shallower. Plain paragraphs stay put. */
export function indentBy(rich: RichText, from: number, to: number, by: 1 | -1): RichText {
  return textFromParagraphs(
    paragraphsOf(rich).map((paragraph) => {
      if (!touched(paragraph, from, to) || paragraph.list === undefined) return paragraph
      const next = Math.min(INDENTS.length, Math.max(0, (paragraph.indent ?? 0) + by))
      const { indent: _indent, ...rest } = paragraph
      return next === 0 ? rest : { ...rest, indent: next as Indent }
    }),
  )
}

/**
 * Replaces a plain-text range with other text, formatting and all.
 *
 * What a paste and a typed shortcut ("- " becoming a bullet) both are. Splits
 * at the two ends the way `applyMark` does, so the runs either side keep their
 * marks and a newline that ends a list item — one character, never split —
 * stays exactly the item it was.
 */
export function spliceText(
  rich: RichText,
  from: number,
  to: number,
  inserted: RichText,
): RichText {
  const split = splitAt(splitAt(rich, from), Math.max(from, to))
  const before: TextSpan[] = []
  const after: TextSpan[] = []
  let seen = 0
  for (const span of split) {
    const start = seen
    seen += span.text.length
    if (seen <= from) before.push(span)
    else if (start >= Math.max(from, to)) after.push(span)
  }
  return normaliseText([...before, ...inserted, ...after])
}

/**
 * Rewrites ONE paragraph and writes the text back canonically.
 *
 * For a change that belongs to a paragraph rather than to a run of characters.
 * Doing it as a character edit is subtly wrong at the end of a text: deleting
 * the only character of an empty line after a list leaves a text that ENDS in
 * the list's newline, which reads as no line there at all (ADR 0014) — so the
 * line the change was for disappears, and the change lands on the item above.
 */
export function updateParagraph(
  rich: RichText,
  index: number,
  update: (paragraph: Paragraph) => Pick<Paragraph, 'spans' | 'list' | 'indent'>,
): RichText {
  return textFromParagraphs(
    paragraphsOf(rich).map((paragraph, at) => (at === index ? update(paragraph) : paragraph)),
  )
}
