# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Product managers, marketers, UX designers, researchers and CRO specialists.

They arrive holding **raw material that has outgrown a document**: interview
notes, session recordings, analytics exports, test results, competitor
screenshots, stakeholder opinions. The job is to turn that into something the
team can act on — a claim, a priority, a decision — without losing the trail
back to what it came from.

Two modes, both first-class:

- **Alone.** One person laying material out and thinking with their hands.
- **Across functions.** A researcher, a marketer and a CRO specialist on the
  same board, who do not share vocabulary and are not all in the room at once.

The cross-functional case is the harder one and the one that matters: these
people describe the same finding in different words, and the board is where
those descriptions have to reconcile.

## Product Purpose

A structured visual workspace on an infinite canvas: a place to lay out messy
input spatially, cluster it, and promote it into things that carry meaning.

Success is that a synthesis session ends with conclusions whose provenance is
still intact — you can point at an insight and see the evidence under it —
without anyone having stopped to fill in a form.

## Positioning

**A sticky note and a piece of research evidence are the same kind of thing to
the system. They differ only in the payload they carry.**

```ts
{ type: 'sticky',   data: { text: 'Customers do not understand pricing' } }
{ type: 'evidence', data: { text: 'Customers do not understand pricing',
                            source: 'September usability study',
                            participant: 'P07',
                            tags: ['pricing', 'comprehension'] } }
```

Both are spatially manipulable canvas objects. Only one can be queried,
filtered, linked and reasoned about.

A neighbouring whiteboard cannot truthfully copy this by adding fields to a
sticky note. It requires a typed object model, a single command layer and schema
versioning underneath the canvas from the beginning — which is what the
architecture here spent its first phase on, ahead of anything visible.

## Operating Context

- Work arrives **after** the research, not during it: the board is where
  material gets made sense of, not where it is captured.
- Sessions are **long and returned to**, not one-shot. A board is re-opened days
  later, often by someone who was not there the first time.
- Participants are **not synchronous**. Cross-functional collaborators
  contribute at different hours and expect to find context when they arrive.
- The board is frequently the **input to something else** — a readout, a ticket,
  a decision record — so what it holds has to survive leaving it.

## Capabilities and Constraints

**Built and working:** infinite canvas with pan/zoom; sticky notes, text, eight
shape kinds, frames, connectors, images, groups; selection, resize, rotation,
z-order, clipboard, undo/redo; snap-to-grid and alignment guides; local
persistence with schema versioning and migrations; image upload validated by
content.

**Technical constraints that are settled and load-bearing:**

- Every persistent change goes through one command layer, so undo, and later
  multiplayer, AI and an API, all share one path.
- Object behaviour lives in a registry, so a new semantic type is added without
  editing the renderer, the command layer or persistence.
- A document that cannot be fully read is never written back.

**Explicitly undecided — do not invent answers:**

- How relationships between objects are modelled (embedded ids vs first-class
  edges). Forced by the first "which insights cite this evidence?" query.
- Collaboration transport and presence topology.
- Rich text versus plain text inside objects.
- Export formats.

## Brand Commitments

- The name is **OpenFrame**.
- Licensed **AGPL-3.0**, with the section 13 offer of source reachable from
  inside the running application. A fork that hosts a modified version must
  point that link at its own source.
- No logo, wordmark, typeface licence, colour ownership or other identity asset
  exists yet. None has been commissioned or chosen.

## Evidence on Hand

Real, and usable:

- Renderer measurements, reproducible via `pnpm test:bench` and
  `pnpm bench:cull`: DOM node count stays flat (54 and 66) from 100 to 10,000
  objects; a cull pass on a 10,000-object mixed board costs ~3ms.
- A working deployment, and the repository itself.

**Absent — must not be fabricated:** there are no users yet, no testimonials, no
case studies, no customer names, no adoption or revenue figures, no press, and
no research conducted *with* OpenFrame. Any such claim would be invented.

## Product Principles

1. **Meaning is carried by the object, not by the layout.** Where something sits
   is a thought; what it *is* must survive being moved, copied or exported.
2. **Structure is earned, never demanded.** A user may drop a plain note and
   promote it later. Nothing asks them to classify before they understand.
3. **The canvas is the product.** Chrome is borrowed space and gives it back.
   Nothing permanently claims a band of the screen.
4. **Local-first.** A board works in one browser with no account and no network.
   Anything a server adds is additive; it is never the price of starting.
5. **Multiplayer is identity, not a feature.** The product is for people who do
   not share vocabulary and are not online at the same time. Decisions are taken
   as if several people will touch this board, even where only one can today.

Principles 4 and 5 pull against each other, deliberately and knowingly: a
local-first board that is also genuinely collaborative constrains how state is
modelled. This is recorded as a live tension, not a resolved one.

## Accessibility & Inclusion

**WCAG 2.2 AA is a target to be met, not an aspiration.** Contrast, visible
focus, keyboard reachability, target size and accessible naming are requirements
that design work must satisfy rather than trade away.

Already committed in the product: an image's editable field is its **alt text**,
because a board is a document someone else will read, and images are the content
most often left meaningless to a screen reader.

Known gaps against this target, recorded rather than claimed fixed: colour
swatches are below the AA target-size minimum, and default shape fill against
its stroke has not been contrast-checked.
