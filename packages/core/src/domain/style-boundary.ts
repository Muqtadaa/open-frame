import { isColorValue, type ObjectStyle } from './object.js'

/**
 * The colour-valued style keys, at runtime.
 *
 * A `Record<..., true>` rather than an array for the reason `EVERY_STYLE_PROP`
 * is one: a colour property added to `ObjectStyle` and forgotten here would be
 * a value going unchecked at the one place that checks.
 */
const COLOUR_KEYS: Readonly<Record<'color' | 'textColor', true>> = {
  color: true,
  textColor: true,
}

/**
 * A style from OUTSIDE — a file on disk, a peer on the socket, an import, an
 * AI answer — with anything unusable dropped.
 *
 * A style value was never checked at all: the envelope says
 * `record(string, unknown)` and each view read the token straight out of it.
 * That was harmless for as long as every colour was a token, because a token
 * is only ever used to INDEX a map and an unknown key simply misses. A literal
 * colour is different in kind: it is handed to CSS as written, so an arbitrary
 * string from a peer would reach the style property of a real element. This is
 * where that stops.
 *
 * Dropped, not rejected. A board whose author picked a colour this build
 * cannot read still opens, drawn in its type's default — losing a colour is
 * not losing work, and rule 7's refusal to write back a document you could not
 * read is about the document, not about one property of one object.
 */
export function sanitizeStyle(json: Record<string, unknown>): ObjectStyle {
  const style: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(json)) {
    if (value === undefined) continue
    if (key in COLOUR_KEYS && !isColorValue(value)) continue
    style[key] = value
  }
  // Other tokens stay unvalidated on purpose: each is only ever a key into a
  // map the view owns, so an unrecognised one misses and the default applies.
  return style
}
