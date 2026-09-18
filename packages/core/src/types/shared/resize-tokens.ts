/**
 * v2 → v3: the size scale widened, and its tokens were renamed.
 *
 * The old ladder ran 0.8× to 1.9×, which was chosen when every shape was the
 * same 160×120. Draw-to-size made a shape any size the user cares to draw, and
 * on a large one even the largest token read as small type in a big box. The
 * new ladder spans 0.6× to 7.6× in nine steps.
 *
 * Renamed rather than re-valued because the names had run out: there is no
 * honest word after "huge", and `lg`/`2xl` is a scale someone can reason about
 * without a lookup table. The cost is this migration, which is the intended
 * price — a board someone made last week must open unchanged.
 *
 * Declares its own local shapes and operates on `unknown`, per rule 6:
 * importing today's `RichText` would make this silently change meaning the next
 * time that type changes. Pure, forward-only, and never edited once shipped.
 */

/** The v2 names, mapped to their v3 equivalents at the same visual size. */
const RENAMED: Readonly<Record<string, string | undefined>> = {
  small: 'sm',
  /*
   * `normal` becomes ABSENT, not `md`. `md` is the object's own size, and the
   * span list already spells that as no size at all — keeping a token that
   * means "the default" would leave two ways to say one thing, which is what
   * every consumer then has to handle.
   */
  normal: undefined,
  large: 'lg',
  huge: 'xl',
}

interface V2Span {
  readonly text?: unknown
  readonly size?: unknown
  readonly [key: string]: unknown
}

export function resizeTokens(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data
  const record = data as { readonly text?: unknown; readonly [key: string]: unknown }
  if (!Array.isArray(record.text)) return data

  const spans = record.text.map((span: unknown) => {
    if (typeof span !== 'object' || span === null) return span
    const v2 = span as V2Span
    if (typeof v2.size !== 'string') return span

    /*
     * A size this migration does not recognise is DROPPED rather than kept.
     *
     * Keeping it would leave a value the v3 schema rejects, which quarantines
     * the whole object — losing a user's words over a font size. Losing the
     * size is recoverable in one click; losing the note is not.
     */
    const renamed = RENAMED[v2.size]
    const { size: _discarded, ...rest } = v2
    return renamed === undefined ? rest : { ...rest, size: renamed }
  })

  return { ...record, text: spans }
}
