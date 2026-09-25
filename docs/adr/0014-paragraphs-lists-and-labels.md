# ADR 0014 · Lists live on the newline, and labels become text

**Status:** Accepted · 2026-09-25 · extends [ADR 0012](0012-rich-text-as-spans.md)

## Context

The owner asked for bulleted and numbered lists "across all text surfaces", and
for connector labels, frame titles and table cells to take the same formatting
as a note. ADR 0012 decided inline formatting only and named both of these as
undecided:

> **Lists, headings and blocks.** This decides INLINE formatting only. A span
> list has no notion of paragraphs beyond the newlines already in the text.

It also kept labels as plain strings, on the grounds that nobody had asked to
format one. Now someone has.

Three constraints shape the answer before any new reasoning:

1. **ADR 0012 chose the shape of a Yjs `Y.Text` delta**, so that collaboration
   maps one onto the other without loss. Whatever lists become has to keep that
   property.
2. **A shared board is open in more than one build at once.** During any deploy
   a tab that is days old and a fresh one write to the same board. A peer's
   object is accepted only when its `dataVersion` is this build's and it
   validates (`remote-object.ts`); anything else is refused, not drawn. So
   whatever an older build cannot read, it does not SEE.
3. **Rule 7: never write back a document you could not fully read.** A change
   that makes existing documents fail validation is a change that quarantines
   people's boards.

## Decision

**A paragraph's attributes live on the newline that ends it.** This is how a
`Y.Text` delta carries block formatting: Quill's `{ insert: '\n', attributes:
{ list: 'bullet' } }` is the same idea, and the delta shape ADR 0012 chose
already has room for it.

```ts
interface TextSpan {
  readonly text: string
  readonly marks?: readonly Mark[]
  readonly size?: SizeToken
  readonly list?: 'bullet' | 'number' // only on a span whose text is exactly '\n'
  readonly indent?: 1 | 2 | 3 // likewise, and only with `list`
}
```

Paragraphs are the text split at its newlines. Reading and writing the text
follow two rules:

- **Reading.** Each paragraph takes the attributes of the newline that closes
  it. A text that ends in a newline has no empty paragraph after it: that final
  newline closed the last one.
- **Writing (canonical).** Every paragraph is closed by a newline carrying its
  attributes. There is one exception: the last paragraph's closing newline is
  left out when that paragraph is plain and not empty. A lone empty plain
  paragraph is the empty text, `''`.

Together these are unambiguous in both directions. A list item followed by an
empty plain line is `item⏎(bullet)⏎`, which is different from a text that ends
on the item, `item⏎(bullet)`. They also keep **every existing document
valid and meaning what it meant**:
- Text with no attributes is plain paragraphs, which is exactly how it rendered.
- A trailing newline in `pre-wrap` never drew an empty line anyway.

**No `dataVersion` bump for body text.** The change is additive: no stored note
needs rewriting. An older build that meets a `list` attribute fails to
validate THAT object:
- loading from storage, it quarantines the object and opens the board
  read-only (rule 7);
- from a peer, it refuses the object, and that peer does not see it until it
  reloads onto the new build.

Either way, only objects that actually use lists are affected. Bumping every
body type would instead make an older build refuse every note a newer build
had written.

**Connector labels and frame titles become rich text.** The label is drawn as
HTML in the connector's SVG, through `foreignObject`, so it takes marks, sizes
and lists like everything else. Both types get a new `dataVersion`: a string
becomes one unmarked span.

**A connector's whole-label marks move into its text.** `style.bold`,
`style.italic`, `style.underline` and `style.textSize` were the per-object form
that rule 27 allowed for labels. With the label now rich text, keeping them
would be two controls for one question.
- The connector's v3 migration writes them onto the label's spans. `textSize`
  small / medium / large maps to span sizes `sm` / (none) / `lg`.
- The connector stops declaring those style props.
- A migration therefore needs to see the object's style as well as its data.
  Type migrations now receive a read-only `style` as a second argument. Every
  existing migration ignores it.

The old keys stay in stored style, unread. Style has always passed unknown keys
through, and stripping them would be a write nobody asked for.

**Table cells are edited as rich text.** They already stored it; the textarea
was the only thing flattening it.

**A plain string is accepted wherever rich text is, and stored as one span.**
An agent naming a frame writes `"name": "Findings"`. ADR 0012's boundary
refused the old shape so it could not be written as-is; this does not write it
as-is either, because `validate` returns the parsed list and every write path
now stores that rather than what it was given.

## Alternatives considered

**Paragraphs as a list of span lists: `{ spans, list?, indent? }[]`.** The
cleanest model to program against. Rejected, for three reasons:
- It changes the type of every body text on every board, so all 12 types
  need a migration.
- An older build handed one renders nothing, because it iterates paragraphs
  as though they were spans.
- It stops being a delta, so collaboration would need a conversion at its
  boundary.

The helpers here expose paragraphs to callers anyway (`paragraphsOf`), so no
consumer has to think in newlines.

**List markers as text (`"• "`, `"1. "`).** Free, and wrong. Numbering does
not renumber, search finds bullets, and every consumer has to strip them.

**Per-span colour.** Still not decided, and not needed here. A table cell's ink
is the cell's, and an object's text colour is the object's. The format bar
offers what the model has.

## Consequences

- `normaliseText` never merges a newline that carries attributes into a
  neighbour. The schema refuses `list` or `indent` on any span other than a
  lone newline, and refuses `indent` without `list`.
- The editor renders paragraphs as blocks and reads blocks back. Pasted `<ul>`,
  `<ol>` and `<li>` from other applications become lists.
- Rule 27 now reads: text takes its marks per SPAN. No type carries per-object
  text marks, and a type with text has one editor.
- `searchText` and every plain-text consumer are unchanged: `plainTextOf` still
  joins the characters, and a list is text with newlines in it.
