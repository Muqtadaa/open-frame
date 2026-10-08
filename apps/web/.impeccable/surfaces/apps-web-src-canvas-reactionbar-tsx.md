---
version: 1
slug: "apps-web-src-canvas-reactionbar-tsx"
primary_target: "apps/web/src/canvas/ReactionBar.tsx"
related_targets: ["apps/web/src/canvas/ReactionChips.tsx","apps/web/src/canvas/ReactionPicker.tsx"]
---

THESIS: A reaction is the quickest mark a person can leave — lighter than a
comment, heavier than nothing. It belongs on the note, says who, and is taken
back by the same press that made it.

MODE: Operate. Done in a second, dozens of times a session, by people whose
attention is on the note rather than the control.

CHIPS: along a markable note's bottom edge, inside it: the emoji and a count,
grouped in the palette's order. A chip you reacted with is pressed, in the
accent wash. Its tip is who reacted and nothing else ("Otter, Heron and you").
A chip is the board's own chrome: a double-click is two presses, never an edit
of the note. Its target meets 24px for a mouse and a finger alike. A viewer
sees the chips disabled.

THE BAR: selecting one markable object raises it beside the object on the
apparatus layer — eight glyphs as pressed toggles, clear of the connect points
and never on or under the record panel — and a face with a plus that opens the
whole library. In landscape on a phone it is a five-column grid.

THE LIBRARY: a search field over the Unicode list in its groups, eight across,
loaded only when first opened. Typing filters; Down goes into the grid and the
arrows walk it; the wheel scrolls it; Tab stays inside; Escape closes it and
hands focus back. Every column whole beside the scrollbar. It keeps off the
record panel.

KEYBOARD: the context menu's React submenu reaches the same eight and "More…",
and reacts to every note in a selection at once.

MOTION: only a reaction left now is inked in, from its own centre, with no
overshoot; a menu-like library only fades.

NOT: an instruction in a tip; a reaction that takes a note into edit; the bar
covering the record panel; the same emoji counted twice because it came from
two places.

FINISH: `reactions.spec.ts` holds reacting from the bar and the keyboard, one
undo step, deletion and undo, the bar and library clear of the record panel,
the library's search, Tab and Escape, tips that only say who, chip targets and
only new reactions inked in; `e2e-rooms/reactions.spec.ts` holds two people
reacting at once and a viewer refused; the "reactions on a note" golden holds
their look in both worlds. Critique 2026-10-07: 30/40. DESIGN.md: Reactions.
