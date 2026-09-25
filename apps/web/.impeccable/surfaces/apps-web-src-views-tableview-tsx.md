---
version: 1
slug: "apps-web-src-views-tableview-tsx"
primary_target: "apps/web/src/views/TableView.tsx"
related_targets: ["packages/core/src/types/table/grid.ts", "apps/web/src/canvas/EditorChrome.tsx"]
---

THESIS: A table on a board is a small spreadsheet, and it should behave like
the one everybody already knows — minus formulas. Selecting, moving, typing
over, inserting, merging and ruling happen the way the hands expect, and
everything lands as ONE edit when you leave.

MODE: Operate. Reached for mid-thought by people laying out data, with the
keyboard as often as the pointer. Predictability of the selection and of what
a key does outranks expression.

TWO MODES: NAVIGATING (a cell or range is selected, no caret; the keyboard
moves the selection) and EDITING (one cell holds a caret; every other cell is
drawn as the board draws it). Double-click, Enter, F2 or typing a character
enters editing; Enter, Tab or a press on another cell leaves it; Escape puts
that one cell back. Escape while navigating, or focus leaving the table,
commits the whole draft.

APPARATUS: column letters over the columns and row numbers beside the rows,
exactly aligned, 12px mono on panel stock at the apparatus radius; pressed,
they select what they name and shift extends. The selection is a 2px accent
ring, a range a 10% accent wash with the starting cell's 1px ring. All drawn
in SCREEN space through the editor's `Overlay` slot — never divided by the
zoom (rule 24).

CELL BAR: the format bar (acting on the caret's cell, or on every selected
cell when there is none), then one switch — fill | text | borders — naming
what the lower half edits, `···` for the table menu and Reset for colours.
Anchored to the whole table and its strips, above or below, beside it when
neither fits; never on the cells it changes.

BORDERS: the eleven presets drawn as the lines they reach, then the pen —
weight, pattern, colour. A line belongs to the grid, so a cell's right and its
neighbour's left are one line with one answer.

TABLE MENU: right-click a cell or a strip, or `···`: insert above / below /
left / right (as many as are selected, dressed like their neighbour), delete,
merge, unmerge, clear. A delete that would take the last row or column is
disabled, not hidden.

NOT: per-cell borders that fight their neighbour; a +/− pair that only works
at the end; a field per cell; anything that writes to the document before the
edit ends; the board's keys (Delete, arrows, letters) acting on the table
while you are inside it.

FINISH: `table-spreadsheet.spec.ts` holds the keyboard, the pointer, inserting
and deleting anywhere with inheritance, merging, each border preset, range
formatting and one undo entry; `surfaces.visual.spec.ts` holds the cell bar,
the borders panel and a merged, ruled table at rest, in both worlds;
`grid.test.ts` holds every operation and the v1 migration.
