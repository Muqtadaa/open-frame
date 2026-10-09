---
version: 1
slug: "apps-web-src-ui-boardoverview-tsx"
primary_target: "apps/web/src/ui/BoardOverview.tsx"
related_targets: []
---

THESIS: A board understood without being seen. The overview says what the
board holds — how much, of what kind, under which frame, and what is claimed
without grounds — in words a screen reader and a newcomer read the same way,
and takes you to anything it names.

MODE: Operate, leaning Read. Opened to orient: on arrival at an unfamiliar
board, or by somebody who cannot scan the canvas by eye.

PLACEMENT: Alt+S, "Board overview" in the board's menu, and on the empty
board's context menu. A panel at the top centre under the navigation band,
`min(440px, 100vw − 2 gutters)`; below 520px it starts after the rail. Only on
the live board — not in a version preview, nor on a board that cannot be read.

CONTENTS: the board's title; one summary sentence ("3 objects: 2 sticky notes,
1 frame." or "Nothing on this board."); "Citing nothing: 1 insight." when a
claim stands on nothing; then a tree in reading order. "Citing nothing" comes
first. A container shows how much it holds in mono, muted, at the row's end,
and opens with a drawn chevron. Each level lists two hundred, then "N more —
find on board", which opens search. Nouns are plural where they should be.

KEYBOARD: the tree takes the keyboard and walks like a tree — up and down,
Home and End, right opens or steps in, left closes or steps out, Enter
chooses. Choosing selects the object, brings it into view and puts the
keyboard on the board. Tab stays inside; Escape or a press elsewhere hands the
keyboard back to where it was.

MOTION: it drops from the top edge like a notice; under reduced motion it
fades.

NOT: a minimap; a list that grows without end on a crowded board; a row whose
press does something different from its name; type names from the code.

FINISH: `board-overview.spec.ts` holds the summary and going to a choice, Tab
kept inside, Escape, grounds, a crowded board listed in part, opening from the
menu and the board, and a frame's row against its arrow;
`navigation-bar.spec.ts` holds the keyboard walk; `phone-width.spec.ts` holds
it starting after the rail; `keymap.test.ts` holds Alt+S; the "board overview"
golden holds its look in both worlds. Critique 2026-10-07: 22/36. DESIGN.md: Board Overview.
