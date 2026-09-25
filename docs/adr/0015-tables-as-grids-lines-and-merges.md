# ADR 0015 · A table's lines live on its grid, and it edits as a spreadsheet

**Status:** Accepted · 2026-09-25 · amends the table type (Phase 3)

## Context

Hands-on testing turned up three problems with tables:

1. **A new row or column was bare.** It took none of its neighbour's dress:
   no fill, no ink, no width. A table somebody had striped by row stopped
   being striped as soon as it grew.
2. **Cell "rules" were confusing.** A cell could carry one `border` colour,
   but a cell drew only its RIGHT and BOTTOM sides. That was so two cells
   would not draw two lines against each other. The result was that colouring
   a cell's rule recoloured half of its box. The table's own line colour
   (`strokeColor`) reached only the outer border, and the inner lines were
   hard-coded. Nothing could make a single line thicker, dashed or absent.
3. **Rows and columns could only be added or removed at the end.**

The owner asked for tables to behave like a spreadsheet, lightweight and with
no formulas. Specifically:

- insert and delete anywhere
- keyboard navigation
- drag-select, including whole rows and columns
- merged cells
- a borders menu where each cell's top, bottom, left and right can be set

## Decision

**A line belongs to the grid, not to a cell.** A line sits between two cells,
so whichever cell stored it, the other one's opinion had to lose. Lines are
stored once, sparsely, by where they sit:

```ts
interface TableLine { color?: ColorValue; weight?: StrokeToken; dash?: DashToken }
interface LineAt { row: number; col: number; line: TableLine }
lines?: { h: LineAt[]; v: LineAt[] }
```

- A horizontal line at `row` runs along the top of that row, under column
  `col`. `row` can equal the row count, which is the bottom edge.
- Vertical lines are addressed the same way by column.
- A cell's four sides are therefore four addresses. The cell beside it names
  the same line from the other side.
- A key that is absent means the table's own value: `strokeColor`, then
  `stroke`. Recolouring the table recolours every line nobody set separately.
- A weight of `none` takes a line away. Removing the entry hands the line back
  to the table.
- The schema refuses a line that is off the grid, and two entries for one
  address.

**Merges are rectangles, and they do not destroy anything.**

```ts
merges?: { row; col; rows; cols }[]
```

- The cells a merge covers keep their contents and are not drawn. Unmerging
  brings them back.
- Search leaves covered text out, because it is not on the board.
- The schema refuses a merge that overlaps another, runs off the grid, or
  covers only one cell.

**A cell carries only `fill` and `textColor`.** The cell schema is `.strict()`,
so a payload that still carries a v1 `border` is refused rather than silently
stripped. Zod strips unknown keys unless told not to, which is the rule 23
trap.

**v1 → v2 migration (`borderToLines`).** A cell's `border` becomes the line
after its column and the line under its row, in that colour. This is exactly
what it drew. It declares its own local shapes (rule 6), and it ships with a
frozen fixture.

**The grid operations are pure, and they return the whole table.** They are
`insertTracks`, `deleteTracks`, `mergeRange`/`unmergeRange`, `setLines` with
spreadsheet presets, `clearCells` and `expandToMerges`. The editor keeps one
draft and dispatches one `UpdateObjectData` when it closes, so building a
table is one undo entry (rules 3 and 4). `resizeGrid` remains, as end-only
insert and delete, for the size picker and MCP callers.

**A new track copies its neighbour.** It takes the weight, each cell's fill
and ink, and the lines of the track before it, or of the track after it at the
very start. It does not copy the words.

- Directly under a header row, it copies the body row below rather than the
  header.
- The table's outer edges stay outer: adding a row under a heavy border moves
  the border down rather than leaving it inside.
- A merge that an insert lands inside grows; one wholly after the insert moves
  along.

**Editing is a spreadsheet's two modes.**

- In **navigation**, a cell or range is selected and there is no caret.
  - Arrows move the selection; Shift extends it.
  - Tab moves in reading order.
  - Enter or F2 opens the cell for typing, and typing a character replaces
    the cell.
  - Delete clears the selection; Mod+A selects every cell.
  - Escape commits the whole edit.
- In **editing**, only one cell is a text field.
  - Enter finishes the cell and moves down; Shift+Enter makes a new line or
    list item.
  - Tab finishes and moves across.
  - Escape puts back what that one cell said before.
- Every other cell is drawn exactly as the board draws it. That also ends the
  old editor's bug where a field kept by index showed a neighbour's text
  after a column was inserted.

**The apparatus is in screen space, lined up with the grid.** Column letters,
row numbers and the selection ring are drawn in a new editor slot, `Overlay`.
`Overlay` hands the view a function that turns a fraction of the object into
a screen rectangle in the chrome layer.

- `Chrome` places a surface beside something. `Overlay` draws exactly on it,
  which is what an address strip needs.
- A ring drawn in the world and divided by the zoom stops getting thinner at
  one world pixel (rule 24).

**The table's `color` is painted as its ground.** It was declared and never
drawn. Unset, the table stands on the panel, which follows After Hours.

## Alternatives considered

**Four borders on every cell, the way HTML tables do it.** This model is the
cause of problem 2: two cells, one line, and a rule about which one wins.
Collapsing borders by precedence (the CSS `border-collapse` algorithm) would
make what the user sees depend on an ordering they cannot see.

**Merges that delete the covered text, as some spreadsheets do.** This is
simpler, but a merge made by accident would then be a loss that only undo
could repair. Keeping the text costs nothing: it is not drawn, and it is not
searched.

**Cells as child objects.** This was rejected in Phase 3 and is still
rejected. Rule 10 applies: 400 bounds calculations per cull.

## Consequences

- `TABLE_VERSION` is 2. An older build that meets a v2 table from a peer
  refuses it until it reloads. Loaded from storage, it quarantines the table
  (rule 7).
- The table's `.of-table` has no CSS border or radius. Every line is on the
  grid, drawn by one SVG over the cells, and runs of identical segments are
  joined so that a dashed rule does not restart at each cell.
- `ObjectEditorProps` gains `Overlay`. Other editors ignore it.
- The web tests `default-colour-coverage` no longer exempt the table. They
  hold it to "the panel when unset, the chosen colour when set".
