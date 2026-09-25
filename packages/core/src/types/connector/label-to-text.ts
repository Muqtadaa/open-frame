/**
 * v2 → v3: a connector's label becomes rich text (ADR 0014).
 *
 * Declares its own local shapes and operates on `unknown`, per rule 6 — it
 * must keep meaning what it means today whatever `ConnectorData` becomes. Pure,
 * forward-only, never edited once shipped.
 *
 * The label's whole-object marks lived in STYLE (`bold`, `italic`,
 * `underline`, `textSize`), because a label was the one text allowed to take
 * them per object. Now that it takes them per span, they are written onto the
 * label's text here, so a bold label stays bold. The style keys themselves are
 * left where they are: style passes keys it does not know through, and nothing
 * reads these any more.
 */

interface V2Data {
  readonly text?: unknown
  readonly [key: string]: unknown
}

/** The label sizes that existed, onto the span ladder. Medium was the default. */
const SIZES: Readonly<Record<string, string | undefined>> = {
  small: 'sm',
  medium: undefined,
  large: 'lg',
}

const MARKS = ['bold', 'italic', 'underline'] as const

export function labelToText(data: unknown, style: Readonly<Record<string, unknown>>): unknown {
  if (typeof data !== 'object' || data === null) return data
  const v2 = data as V2Data
  // Anything but a string is left for validation to refuse, and the board to
  // quarantine — see `textToSpans` for why coercing it would be worse.
  if (typeof v2.text !== 'string') return data
  if (v2.text === '') return { ...v2, text: [{ text: '' }] }

  const marks = MARKS.filter((mark) => style[mark] === true)
  const size = typeof style.textSize === 'string' ? SIZES[style.textSize] : undefined
  return {
    ...v2,
    text: [
      {
        text: v2.text,
        ...(marks.length === 0 ? {} : { marks }),
        ...(size === undefined ? {} : { size }),
      },
    ],
  }
}
