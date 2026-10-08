# ADR 0020 · Export is a readout first: Markdown, with provenance

**Status:** Accepted · 2026-10-08 · the format and scope chosen by the owner
(2026-10-08). Cites ADR 0011, rules 5, 10 and 21.

## Context

Nothing left a board. The parity matrix ranks "take the board out" as the
first replacement-critical gap, and PRODUCT.md listed the export formats as
explicitly undecided. The candidates have very different constraints:

- **An image or PDF** of a frame is what a readout slide wants. The canvas is
  DOM rather than one drawing surface, and only the viewport is rendered, so
  a picture needs a rendering path of its own or a rasteriser library.
- **A board file** (the persisted envelope, images included) is a backup. It
  needs an import to be useful, and image locators (`idb:`) mean nothing
  outside the browser that wrote them.
- **CSV** is one row per object, for a spreadsheet or a ticket import.
- **A Markdown readout** is what the board SAYS, organised as it is, with each
  claim beside what it stands on.

The last one is the semantic opportunity the matrix names as the largest: a
readout that keeps provenance. No neighbour can produce it, because no
neighbour knows that this note is evidence and that one an insight citing it.

## Decision

**The first export is a Markdown readout** of the board, a frame, or a
selection.

- **Board:** "Export as Markdown" in the board's menu.
- **A frame, a group or several things:** the same entry in their context
  menu, beside Copy. One note does not offer it. Its menu already fills a
  laptop window, and a readout of one note is that note.
- **The file** goes to the browser's downloads, named for the board and the
  part (`pricing-study-interviews.md`), and the board announces it. Nothing
  is written, so a viewer can export too.

**What it says** (`apps/web/src/scene/export-markdown.ts`):

- `# <board>` and the date and count, then the board in reading order:
  - **Loose things first**, then each frame as a heading (deeper frames
    deeper, capped at six), so no note reads as inside a frame it is not in.
  - **Each object** is its type and its words, with their paragraphs, lists
    and marks. Words Markdown would read as structure are escaped.
  - **A record's fields** follow under the labels its type declares.
  - **Grounds:** what each object stands on ("Cites: Evidence: …") and what
    stands on it ("Insight that cites this: …"). A ground outside a partial
    export is still named, marked "(not in this export)".
- **A board export ends with "Citing nothing"**: the claims a reader should
  check first.
- **Objects with no words and no record** (a bare shape, a line) are counted,
  not listed.

**Read off the registry, never off type names (rule 5).** The words come from
a new optional `ObjectDescription.body`: the rich text itself, which the
thirteen types with rich text supply. Fields come from the declared fields
(rule 21), and grounds from the relation index (ADR 0011), built once (rule 10).
A test creates one of every spatial type and requires each one's words in the
export under its label, so a type added later is held to it without anybody
listing it.

## Rejected, for now

- **Images, PDF, CSV and a board file with import** are not refused. They are
  later, each with its own question: a render path, a column scheme, a way to
  carry image bytes.
- **Exporting one note** from its context menu: see above.
- **A Markdown table for a table object:** a table exports as its words, like
  anything else. A table rendering is a later refinement of the same seam.

## Consequences

- PRODUCT.md's export question is answered for the first format and stays
  open for the others.
- `describe()` now has a third kind of consumer that keeps formatting.
  `body` is optional, so a type without rich text loses nothing.
- The board's menu always shows, since it is never only Rename now.
