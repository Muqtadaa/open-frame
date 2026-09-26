---
version: 1
slug: "apps-web-src-canvas-selectionoverlay-tsx"
primary_target: "apps/web/src/canvas/SelectionOverlay.tsx"
related_targets: ["apps/web/src/canvas/EndpointOverlay.tsx", "apps/web/src/canvas/ConnectPoints.tsx", "apps/web/src/canvas/CropOverlay.tsx", "apps/web/src/canvas/DividerOverlay.tsx", "apps/web/src/canvas/AlignmentOverlay.tsx", "apps/web/src/canvas/HoverOverlay.tsx", "apps/web/src/canvas/BoardAnnouncer.tsx", "apps/web/src/views/FrameView.tsx"]
---

THESIS: The selection apparatus tells the truth about what is selected, where it
is now, and what a press or a key will do to it, at any zoom, on any fill, with
or without a pointer.

MODE: Operate. Truth during a gesture, reach and legibility outrank expression.
The look stays the editor-grade one (the owner kept it); what it gained is
contrast and honesty.

SCREEN SIZE: every piece lives on the apparatus layer, outside the world
transform (rule 24), and nothing inside the world divides a border by the
zoom: a frame's edge is laid out at zoom× and painted at 1/zoom.

LINE: the selection is 2px of the accent with a 3px page-coloured halo; guides
and route legs carry the same halo. On every slip and ink in both worlds either
the line or its halo clears 3:1, and the line clears 3:1 on its halo.

TARGETS: every grip presses as 24px (WCAG 2.5.8). A target is worked out as the
rectangle it should cover, minus the box it is positioned in, including that
box's border. Resize and crop targets are spent OUTSIDE the object. Below 48px
on screen a selection is compact: its four corners, outside it, and nothing
else; its middle moves it.

TRUTH: a move carries the box; a lone line is selected by its ends; a group
says "Group of N"; each member of a multi-selection is marked; a resize shows
its size and a turn its angle; the object under the pointer is outlined before
it is pressed; a handle's cursor turns with the object; a grip answers hover
and press; the padlock is a button that unlocks.

KEYBOARD: the board is a tab stop that draws its own ring. Tab/Shift+Tab walk
objects in reading order and let go past the last. Arrows move, Alt+arrows
resize by the grid step, period and comma rotate by 15°, Mod+Shift+L locks.
A polite announcer says what is selected and what a key did. Escape backs out
one step: a drag in flight, then a crop, then the selection.

NOT: a box left behind by a move; a grip smaller than 24 to press; handles that
bury a small object; a line that vanishes on a black note or a coloured
connector; a border that thickens with the zoom; a gesture only a pointer can
make; a selection that changes in silence.

KNOWN: connect points and an attached line's end sit on a rotated object's
upright bounds, not its turned edges; guides carry no distances; crop has no
entry in the record panel; the record panel can sit over the object a line is
being aimed at.

FINISH: `selection-apparatus.spec.ts` (move truth, lone line, targets, compact,
keyboard, Escape, what a selection says, under the pointer), `apparatus.spec.ts`
(screen size, the frame's edge at 1600%), `images.spec.ts` (crop targets
outside, Escape), `design-tokens.test.ts` (halos), `keymap.test.ts`, and the
surface goldens in both worlds.
