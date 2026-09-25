---
version: 1
slug: "apps-web-src-ui-inspector-tsx"
primary_target: "apps/web/src/ui/Inspector.tsx"
related_targets: ["apps/web/src/ui/RecordFields.tsx","apps/web/src/ui/Provenance.tsx","apps/web/src/controls/Swatches.tsx","apps/web/src/controls/ColorPicker.tsx"]
---

THESIS: The record panel is where the product's claim becomes visible — a
note and a piece of evidence are the same object with a different payload. So
it names the thing first, puts the payload (the record) before the dressing
(the appearance), and never lets a blank record pass for a filled one. It is
a signature component because of what it SAYS, not because of how it floats.

MODE: Operate. Reached for mid-synthesis, dozens of times a session, by people
who are thinking about their material rather than the tool: scanability,
honesty about state and keyboard reach outrank expression.

HEAD: the type as a title in the interface's own voice (15px/600 ink,
"Evidence", "Journey stage") with the object's own one-line summary beneath
in muted 12px; a mixed selection reads "2 objects" over what it is made of.
Never the type id in mono — that was the faintest text in the panel on its
most important line.

BANDS: a type with semantic fields gets `record` above `appearance`, named as
specimen labels (12px mono lowercase, the front door's register). Fields come
from the registry (rule 21) and commit on blur or Enter; Escape abandons. An
empty field is dashed with an italic "e.g." example — an unsourced slip must
never read as sourced (PRODUCT.md: provenance intact).

WORDS: each label names one thing. Colour targets are surface / text / outline
/ label; "fill" is only none-tint-solid, "dash" the line's pattern, "vertical"
the vertical alignment. A new object's colour is marked though nobody chose
it: views declare `defaultColor` and a render test holds them to it.

GESTURES: colour and opacity are gestures. They preview through
`stylePreview` in the interaction store and write ONE command when the
gesture ends (release, Enter, blur, closing the picker), onto the objects
they were previewed on; Escape takes the preview back (rules 4 and 14).

KEYBOARD: Delete is last in order and drawn in the top corner — never the
first Tab stop from the board. Each radio row is one stop with arrows that
move and wrap. Every option is at the 30px secondary target; nothing reads
below 12px.

PLACEMENT: floats beside the selection (right, left, below, above) and gets
out of the way — a menu paints over it (`--of-z-menu`), and holding Shift,
which means "add to the selection", makes it step aside with the pointer
passing through. It never paints over what the person is reaching for next.

NOT: a docked sidebar (the board is the product; nothing standing takes board
space while nothing is selected); a second list of fields (the registry is the
list); a modal; a panel that writes per event.

FINISH: e2e in `inspector.spec.ts` and `structured-objects.spec.ts` hold the
gestures (one undo entry per drag), the menu layer, the Shift step-aside, the
default colour, the keyboard order and the target floor; the screenshot
goldens hold its look in both worlds.
