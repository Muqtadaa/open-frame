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
 */
export const SIZE_TOKENS = ['small', 'normal', 'large', 'huge'] as const
export type SizeToken = (typeof SIZE_TOKENS)[number]

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
  })
  .strict()

/**
 * At least one span, always.
 *
 * An empty list and a list holding one empty span would be two spellings of
 * "no text", and every consumer would have to handle both.
 */
export const RichTextSchema: ZodType<RichText> = z.array(TextSpanSchema).min(1)

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
  return next.length === 0 ? { text: span.text, ...sizeOf(span) } : { ...span, marks: next }
}

function sizeOf(span: TextSpan): { size?: SizeToken } {
  return span.size === undefined ? {} : { size: span.size }
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
        ? { text: span.text, ...(span.marks === undefined ? {} : { marks: span.marks }) }
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
