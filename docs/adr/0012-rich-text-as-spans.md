# ADR 0012 · Text is a list of spans, not a string

**Status:** Accepted · 2026-09-18

## Context

Feedback from the deployed build asked for bold, italic, underline, strikethrough
and size — applied to *selected text*, not to the whole object. That is the
question [`PRODUCT.md`](../../PRODUCT.md) has carried as explicitly undecided
since Phase 1:

> Rich text versus plain text inside objects.

Every text-bearing type stores `text: string` today: `sticky`, `text`, the
`shape` label, the `connector` label, `evidence` and `insight`. A change here
touches all of them, their migrations, search, export, and the editor.

Three prior decisions constrain the answer before any new reasoning starts.

**[ADR 0007](0007-collaboration-yjs-deferred.md) shaped the document for merge,
and [ADR 0011](0011-relations-as-objects.md) chose a model on merge behaviour
rather than on convenience.** `PRODUCT.md` raised multiplayer from a planned
feature to part of the product's identity. Text is the single most concurrently
edited thing on any board, so a representation that merges badly fails here
first and worst.

**A `Patch` replaces a value at a path.** Editing text today is one `set` on
`['data','text']` carrying the whole new string — last writer wins. That is
already the weakest merge behaviour in the system, and it is deliberate: ADR
0007 records collaborative text as a problem Yjs solves, not one the patch
format should.

**`describe().searchText` is the single seam** that board search, AI context,
MCP and export read from. Whatever text becomes, it must still flatten to a
plain string there.

## Decision

**An object's text is an ordered list of spans**, each carrying a run of
characters and the marks on it.

```ts
type RichText = readonly TextSpan[]
interface TextSpan {
  readonly text: string
  readonly marks?: readonly Mark[]   // 'bold' | 'italic' | 'underline' | 'strike'
  readonly size?: SizeToken          // 'small' | 'normal' | 'large' | 'huge'
}
```

This is deliberately the shape of a **Yjs `Y.Text` delta**. ADR 0007 already
chose Yjs and shaped three document decisions around it; this is the fourth.
`Y.Text.toDelta()` produces `[{ insert, attributes }]` — the same list of runs
with formatting — so the collaboration adapter maps one onto the other without
either side learning about the other, exactly as it will for patches.

Size is a **token, not a number**. A board where every note carries an arbitrary
point size stops being a board and becomes a document, and tokens keep theming
possible, keep documents small, and keep "make this bigger" expressible by an AI
command — the same reasoning as every other style token.

## Alternatives considered

**Offsets into a plain string — `{ text: string, marks: [{from, to, type}] }`.**
The obvious model, and the one most editors start with. Rejected on merge, which
is the axis this project has already committed to twice.

Every offset is a position in a string that another person is editing. Someone
typing a word at the start of a note shifts every mark after it, and their patch
carries no information about the marks at all — so the two edits, which are not
in conflict, silently produce bold on the wrong words. Spans have no offsets to
invalidate: an insertion splits or extends a span and the marks travel with the
characters they were applied to.

It is also the wrong shape for the CRDT that is already chosen, so it would have
to be converted at the boundary anyway — and conversion from offsets to runs is
lossy in exactly the cases where the offsets have gone stale.

**An HTML string.** What a `contenteditable` hands you if you let it. Rejected
because it is opaque: `searchText` would need an HTML parser, export would carry
whatever the browser felt like emitting that day, and any of it reaching the DOM
again is an injection surface on a document format this product is committed to
accepting from other people. A representation the domain cannot read is not a
representation.

**Per-object style tokens — `style.bold`, `style.fontSize`.** Cheapest by a
wide margin: no model change, no migration, one more `styleProp` and one more
control. It was the recommendation until the answer came back as "selected
text". Rejected because it cannot express the thing that was asked for, and
because shipping it would put a second way to say "bold" in the document that
inline marks would then have to reconcile with forever.

**Deferring again.** Rejected. The deferral existed because the information to
decide was missing; a user has now asked for the feature by name, which is
exactly the trigger `PRODUCT.md` records for settling an open question.

## Consequences

**Body text becomes spans; LABELS stay plain strings.** `sticky`, `text`, the
`shape` label, `evidence` and `insight` each go to a new `dataVersion`, with a
migration that wraps the old string in a single unmarked span.

A frame's `name` and a connector's label do not, and the distinction is not
squeamishness about scope: a connector's label is drawn inside an SVG `<text>`
element, where `<strong>` means nothing and the equivalent is `<tspan>` with its
own font metrics. More importantly they are LABELS — a few words naming a thing
— and nobody has asked to bold half of one. A type can be promoted later by
adding a migration; the reverse, un-picking rich text from a label that never
needed it, is the expensive direction. The transform is shared and
frozen; the migrations are per-type because that is what
[ADR 0008](0008-schema-versioning-and-migrations.md) requires, and each ships a
frozen fixture (rule 6).

**Plain text is derived, never stored.** `plainTextOf(spans)` is what
`searchText`, `summary`, alt text, exports and AI context read. Storing both
would be two sources of truth about the same characters, and they would diverge
the first time one path was updated and the other was not.

**The editor stops being a `<textarea>`.** A textarea cannot show a bold word.
This is the expensive part of the decision and the reason it is a phase rather
than a commit: a `contenteditable` has to be driven, not trusted — its own undo
is wrong, its paste carries arbitrary HTML that must be reduced to spans, and
composition events for IME must not be interrupted. Nothing is written to the
document until editing ends, exactly as for every other gesture.

**An empty object is one empty span, never an empty list.** A list with no spans
and a list with one empty span would be two representations of the same thing,
and every consumer would have to handle both. The schema requires at least one.

**Marks are a closed set.** Adding one is a schema change and a migration
concern, which is the intended friction: a mark the renderer does not know is a
mark that silently does nothing, which is the class of bug rule 21 exists for.

## What this does not decide

- **Links.** A mark carrying a URL is a different thing from a presentational
  mark — it has a target, it can be broken, and it needs its own validation.
- **Lists, headings and blocks.** This decides INLINE formatting only. A span
  list has no notion of paragraphs beyond the newlines already in the text.
- **Per-span colour.** `style.color` is the object's, and whether a run of text
  can differ from it is a design question nobody has asked yet.
