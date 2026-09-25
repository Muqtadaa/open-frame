---
version: 1
slug: "apps-web-src-ui-toolbar-tsx"
primary_target: "apps/web/src/ui/Toolbar.tsx"
related_targets: ["apps/web/src/ui/TableSizePicker.tsx"]
---

THESIS: The rail is the margin of the page: what you can put ON the board, and
nothing else. It is quiet at rest and unambiguous about one thing — which tool
you are holding — because every click on the board means something different
depending on the answer.

MODE: Operate. Reached for constantly, often by letter key, by people whose
attention is on their material. Legibility of the armed state, keyboard reach
and never getting in the way outrank expression.

RUNS: three groups with a rule between each, each a labelled group for a
screen reader — navigate (select, hand), make (sticky, text, shape, frame,
connect, table, code, image), annotate (comment). Image is made like the rest
of its run; it is a button only because it needs a file first. Selection
actions are never here: they live with the selection (the record panel) and
history lives on the navigation bar.

STATES: muted ink at rest; ink on the accent wash on hover; the page's colour
on a FILLED INK BED when armed, measured off the rule in
`design-tokens.test.ts`. Hover and armed differ in kind, never only in hue.

OPTIONS: Shape and Table have them. Pressing the ARMED tool opens them; a
12px strip in the rail's padding, beside the tool and never inside it, is the
pointer's shortcut to the same menu. Opening moves focus in, Escape or a press
elsewhere closes it and hands focus back, and the menu paints on the menu
layer. The shape menu walks with the arrows and wraps; the size grid is one
Tab stop of 24px cells the arrows resize, read out in words ("4 columns × 2
rows"). U cycles the shape kind; nothing on the rail does.

KEYBOARD: every tool is reachable and PRESSABLE — Space and Enter belong to a
control the keyboard focused, and to the board's pan hold and edit otherwise.
Each tool carries `aria-keyshortcuts`; its tip shows the key on hover (after
the shared dwell) and at once on keyboard focus.

PLACEMENT: centred in the band between the navigation bar and the bottom gutter,
never crossing either. Tools step down a decade of the rule as the window
shortens — 50, 40 below 720 tall, 30 below 604 — and only below 494 does the
rail scroll, because a scrolling box clips the tips. Its footprint is one
shared constant (`scene/rail-footprint.ts`) that floating surfaces keep clear
of.

NOT: a palette of every object type; a place for selection actions or
history; a menu hidden behind a right-click; a control whose second press
means something different on different tools.

LAYER: the rail rises over the apparatus layer (`--of-z-reached`) while the
pointer or the keyboard is in it, so its tips read over a record panel that
opened beside it; at rest it stays under apparatus near the left edge.

FINISH: `rail-keyboard.spec.ts` holds keyboard pressing, the pan hold after a
click, grouping, key announcement, tip dwell and its tips reading over the
record panel; `rail-menus.spec.ts` holds
opening by second press, Escape and outside press, keyboard walking, target
sizes, and the rail fitting 720/640/560-tall and 760-wide windows; the
screenshot goldens hold its look in both worlds.
