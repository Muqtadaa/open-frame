---
version: 1
slug: "apps-web-src-views-stickyview-tsx"
primary_target: "apps/web/src/views/StickyView.tsx"
related_targets: ["apps/web/src/views/StructuredSlip.tsx", "apps/web/src/views/TextView.tsx", "apps/web/src/views/ShapeView.tsx", "apps/web/src/views/FrameView.tsx", "apps/web/src/views/ConnectorView.tsx", "apps/web/src/views/ImageView.tsx", "apps/web/src/views/TableView.tsx", "apps/web/src/views/CodeView.tsx", "apps/web/src/scene/style-tokens.ts", "apps/web/src/scene/label-scale.ts", "apps/web/src/scene/derived-placement.ts"]
---

THESIS: Everything on the board is stock laid on one page, and a typed note
says what it is in words — so a finished board shows its synthesis, not just
its colours, in either world and to anyone reading it.

MODE: Operate, and the content is the user's. The slips carry the identity;
shapes, code, images and tables stay deliberately plain, but are cut and laid
the same way: the page's 2px corner and the one slip height (shapes excepted,
because a box shadow is a rectangle).

TYPE: a typed slip's record band is always drawn and always led by its type's
name in 600 mono ("evidence", "decision · accepted"). Colour is the second
signal, never the only one: no two slips share a default, and a filled frame
(white) shares none with any type. Re-colouring a slip never erases its type.

EDGES: an object's edge is how it is found, so it clears 3:1 on what it sits
on. Black and white strokes go through `lineOf` to `--of-line-*`; the frame's
edge is the control border; a table's inner grid is `--of-edge-inner`. All of
it is read off the rules and views and measured in `design-tokens.test`.

AFTER HOURS: slips wear `--of-slip-ring`, a 3:1 hairline and a second lit
edge; white paper is dimmed until it is no brighter than the ink.

LABELS: a shape's label is centred on both axes until placed, and the panel
marks what is drawn. A connector's label follows the board between half and
twice its 100% size, wears a page-coloured halo, and on a plate takes the ink
that reads on it.

READING: an object is named by what it is (and its record), never by its body,
which is read once as content. An image without a description is still an
image. A table's cells sit in rows. Nothing on the board is a scroll region
nobody can reach. An editor sets its text exactly as the object does, so
opening it never reflows a line.

PLACEMENT: a derived slip goes beside its cluster — above when free, else the
next side and further out — preferring a place already on screen.

GUARDS: `views/typed-notes.test`, `views/edges.test`, `views/object-names.test`,
`scene/label-scale.test`, `scene/derived-placement.test`, the "edges that never
vanish", "slips at night", "plain kit" and "fresh text box" suites in
`app/design-tokens.test`, and `e2e/editor-matches.spec`.
