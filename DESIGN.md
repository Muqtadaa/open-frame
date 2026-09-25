---
name: OpenFrame
description: An engineering quadrille page that treats every mark on it as a record, with a second world for after hours.
colors:
  bg: '#eef2f6'
  page: '#f7f9fb'
  rule: '#e4ebf2'
  rule-decade: '#c9d6e4'
  panel: '#ffffff'
  panel-border: '#c7d2de'
  control-border: '#758596'
  ink: '#16202b'
  ink-muted: '#4e6070'
  accent: '#1450b5'
  accent-soft: '#e4ecfa'
  guide: '#b0197a'
  danger: '#a3231b'
  danger-wash: '#f9ebea'
  danger-edge: '#e0bcb8'
  hover: '#e8edf3'
  c-yellow: '#7a5c00'
  c-green: '#146045'
  c-blue: '#17529e'
  c-red: '#8a4038'
  c-violet: '#5b3ba8'
  c-orange: '#8c4715'
  c-gray: '#3f5163'
  c-pink: '#8f2a67'
  c-brown: '#6a4a2a'
  c-black: '#16202b'
  c-white: '#ffffff'
  s-yellow: '#ffe9a3'
  s-green: '#bff0d4'
  s-blue: '#cfe2ff'
  s-red: '#ffd5d0'
  s-violet: '#e3daff'
  s-orange: '#ffddb8'
  s-gray: '#dfe5ec'
  s-pink: '#ffd4ef'
  s-brown: '#e8dcc6'
  s-black: '#16202b'
  s-white: '#ffffff'
typography:
  display:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '22px'
    fontWeight: 400
    lineHeight: 1.3
  body:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.35
  shape-label:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.3
  ui:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.3
  ui-small:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1
  title:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '17px'
    fontWeight: 600
    lineHeight: 1.3
  headline:
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
    fontSize: '19px'
    fontWeight: 600
    lineHeight: 1.35
  record:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace'
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1
    letterSpacing: '0.02em'
rounded:
  hair: '1px'
  slip: '2px'
  apparatus: '4px'
  control: '6px'
  surface: '10px'
  grip: '25%'
  round: '50%'
  capsule: '999px'
spacing:
  space-2: '2px'
  space-4: '4px'
  space-6: '6px'
  space-8: '8px'
  step: '10px'
  space-12: '12px'
  space-16: '16px'
  gutter: '20px'
components:
  tool:
    backgroundColor: 'transparent'
    textColor: '{colors.ink-muted}'
    rounded: '{rounded.control}'
    size: '50px'
  tool-hover:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.ink}'
  tool-active:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.accent}'
  tool-tip:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.page}'
    typography: '{typography.ui-small}'
    rounded: '{rounded.control}'
    padding: '5px 8px'
  rail:
    backgroundColor: '{colors.page}'
    rounded: '{rounded.apparatus}'
    padding: '5px'
  status:
    backgroundColor: '{colors.page}'
    textColor: '{colors.ink-muted}'
    typography: '{typography.record}'
    rounded: '{rounded.apparatus}'
    padding: '5px 10px'
  zoom:
    backgroundColor: '{colors.page}'
    textColor: '{colors.ink-muted}'
    rounded: '{rounded.apparatus}'
    padding: '5px'
  inspector:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.ink}'
    rounded: '{rounded.surface}'
    padding: '10px'
    width: '360px'
  field-label:
    textColor: '{colors.ink-muted}'
    typography: '{typography.record}'
    width: '82px'
  swatch:
    rounded: '{rounded.slip}'
    size: '30px'
    layout: '6-column grid'
  choice-item:
    backgroundColor: 'transparent'
    textColor: '{colors.ink-muted}'
    rounded: '{rounded.apparatus}'
    width: '28px'
    height: '26px'
  choice-item-on:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.accent}'
  menu:
    backgroundColor: '{colors.panel}'
    rounded: '{rounded.surface}'
    padding: '5px'
  menu-item:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    typography: '{typography.ui}'
    rounded: '{rounded.control}'
    padding: '6px 9px'
  menu-item-hover:
    backgroundColor: '{colors.accent-soft}'
  button:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '30px'
  button-hover:
    backgroundColor: '{colors.hover}'
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.panel}'
    rounded: '{rounded.control}'
    padding: '0 12px'
    height: '30px'
  button-primary-large:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.panel}'
    rounded: '{rounded.control}'
    padding: '0 18px'
    height: '40px'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.ink-muted}'
    rounded: '{rounded.control}'
    height: '30px'
  icon-button:
    backgroundColor: 'transparent'
    textColor: '{colors.ink-muted}'
    rounded: '{rounded.control}'
    size: '30px'
  icon-button-hover:
    backgroundColor: '{colors.hover}'
    textColor: '{colors.ink}'
  icon-button-on:
    backgroundColor: '{colors.accent-soft}'
    textColor: '{colors.accent}'
  field:
    backgroundColor: '{colors.page}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '5px 10px'
    height: '30px'
  field-large:
    backgroundColor: '{colors.page}'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
    padding: '8px 12px'
    height: '40px'
  tip:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.page}'
    typography: '{typography.record}'
    rounded: '{rounded.control}'
    padding: '6px 8px'
  sticky:
    typography: '{typography.body}'
    rounded: '{rounded.slip}'
    padding: '13px'
  frame:
    backgroundColor: 'transparent'
    rounded: '{rounded.slip}'
---

# Design System: OpenFrame

## Overview

**Creative North Star: "The Notebook"**

The board is a laboratory record, not a drawing surface. The register is the
engineering computation pad: cold blue-grey stock, a cyan-grey quadrille ruling
at world scale, blue-black ink that is never pure black, and one correction red
that appears only where something is being undone or removed. Content arrives as
coloured index slips laid _on_ the page — the one place in the system that is
allowed real physical depth.

It refuses two things explicitly. The first is the canvas-app default: a neutral
void with floating candy chrome, white capsules blurred over the artboard. Chrome
here is page apparatus — it takes the page's own stock, a hairline margin rule and
a contact shadow just deep enough to separate it from the ruling. Three floating
white capsules at once was the single biggest reason an earlier pass read as a
toy. The second refusal is stationery: cream, parchment, serif display,
handwriting, paper texture and torn edges are the twee rendition of a notebook and
are banned. This is the pad an engineer computes on, not the diary.

Density is measured and quiet. The empty board is almost entirely board; chrome
sits in the margins and the corners, and the panel that names a selection only
exists while there is a selection. Nothing decorative is ever loud enough to
compete with what the user put down.

**It used to say high.** The first build was quiet and genuinely cramped —
22px controls, 11px readouts, a 28px text field — each defensible alone and
collectively hard to use. The owner called it on 2026-09-19 and the scale
moved onto the quadrille (below). Quiet is the commitment; small was never the
commitment, and the two had been confused.

**Key Characteristics:**

- Ruled ground at every reachable zoom, in three weights, all faint
- Page apparatus in the page's own stock, never floating cards
- Ink is blue-black; red is reserved for correction
- Coloured slips with real elevation; everything else flat
- System faces only — no webfont request leaves the machine
- Mono for records and measurement, never as a costume
- WCAG 2.2 AA enforced against the stylesheet by a build test

## Two worlds

The board ships in two, and they are not a light palette and a dark variant of
it. They share token NAMES and nothing else, which is the entire reason a saved
board never has to be touched when one is swapped for the other: documents store
`color: 'blue'`, and what blue IS belongs to the world.

**The Notebook** is the default and the one above: the engineering computation
pad, cold stock, printed rule.

**After Hours** (`:root[data-theme='after-hours']`) is the same notebook at
night, lit by its own grid. The quadrille stops being printed rule and becomes a
lit horizon; ink inverts to a violet-white that never reaches pure white; the
synthwave palette earns its place because the GROUND is doing the glowing. It is
opt-in from the record line and remembered, and it is deliberately not wired to
`prefers-color-scheme` — a system preference set for reading email at night is
not a statement about how somebody wants to look at their research.

Three things carried across rather than being redesigned:

- **Content hues keep their meaning.** A red slip is still red — inverted to
  light ink on a deep body, not re-hued. `danger` moved instead: on a dark
  ground a content red and a correction red must both be light, which put them
  18 sRGB units apart until the correction red was pushed to a hot red-orange.
- **Depth needs a lit edge, not a deeper shadow.** A cast shadow works by being
  darker than what it falls on and there is very little room below the night
  page, so slips read as holes cut in it. A hairline highlight on the top edge
  is where light catches a raised edge — the physics the default world gets free
  from a white page.
- **Chrome still does not glow.** Saturated colour belongs to the user's
  material in both worlds. Glowing apparatus would compete with a magenta slip
  that MEANS something, which is the whole reason the neon lives on the ground
  and in the brand rather than on the controls.

Every pair in both worlds is measured by the same build test.
`design-tokens.test.ts` walks EVERY theme block rather than the first it finds —
it took the first `--of-x:` in the file until After Hours arrived, which would
have let a second world ship unreadable while the suite went on measuring the
first one and passing.

## The brand

The mark, the wordmark and the synthwave hero are one supplied artwork
(`src/assets/PROVENANCE.md`). They are the source of the `--of-brand-*` tokens,
and those tokens paint exactly two things: the boot splash and the browser tab
icon.

The **front door carries the mark as artwork** — a third brand surface, taken
deliberately by the owner on 2026-09-19 rather than reached by drift. An entry
page is where a product says its own name. It is the mark only, at 32px, beside
a wordmark set in ordinary type: no brand COLOUR enters the page, so the rule
that matters is intact. The workspace is still quiet.

That restraint is the point. The identity is loud on purpose and the workspace
is quiet on purpose, and the boundary between them is where a brand stops being
decoration.

The splash is the one full-bleed brand moment the product has. It lives in
`index.html` and paints before the module graph loads, carrying its own first
frame as a 146-byte inlined thumbnail — a loading screen that waits on the
network to prove it is loading has the logic backwards.

It then **holds for two seconds**, and that part is not free. On a warm load the
board is ready well inside it, so the hold IS the loading time. It was chosen
knowingly: a moment nobody sees is not a moment, and the first build flashed the
artwork past in under 300ms. Whichever finishes last wins, so a slow board is
never delayed further. If the wait ever starts to grate, spend it once per
session rather than shaving it back to a flicker — a shorter splash is worse
than no splash.

Two things follow from covering a live board for that long. `#root` is `inert`
until the splash goes, because a sheet blocks the mouse but not the Tab key. And
the end-to-end suite turns the hold off through `storageState`, since 154 specs
each waiting behind it would add five minutes to a two-minute run; the splash
still appears there and is still really removed.

## Colors

Cold, low-chroma stock and ruling under a small set of saturated content slips;
the only insistent hues in the whole system belong to the user's material.

### Primary

- **Record Blue** (`accent`): the working blue of selection, focus, active tools,
  connector endpoints, caret and slider accent. Held at 3:1 against the page and
  4.5:1 against panel white by test.
- **Record Blue Wash** (`accent-soft`): the active and hover bed under tools,
  menu items and the zoom input, and the text-selection highlight. It carries
  ink and accent at text contrast, so it is a surface, not a glow.

### Secondary

- **Correction Red** (`danger`): destructive and corrective meaning only —
  delete affordances, render errors, missing assets, failure toasts.
- **Guide Magenta** (`guide`): alignment guides while a gesture is running. It is
  transient feedback, never a target and never chrome.

### Neutral

- **Desk Blue-Grey** (`bg`): the surface the page sits on; also the bed inside
  segmented controls and the hover bed for record-line actions.
- **Page Stock** (`page`): the board itself, and the stock every piece of
  apparatus is cut from.
- **Fine Rule** / **Decade Rule** (`rule`, `rule-decade`): the quadrille. Both sit
  deliberately below the 3:1 UI floor (see the named rule below).
- **Panel White** (`panel`): the record panel, menus, flyouts and editors — the
  one surface allowed to be lighter than the page, because it overlays it.
- **Margin Rule** (`panel-border`): hairline borders and ledger dividers on all
  apparatus.
- **Control Edge** (`control-border`): boundaries you must see to operate a
  control, plus the scrollbar thumb. Held at 3:1 against page, panel and desk.
- **Blue-Black Ink** (`ink`): all primary text, the slider index, tooltip bodies.
- **Muted Ink** (`ink-muted`): field labels, record line, inactive tools, frame
  titles, shortcut glyphs.

### Content Colours

Eleven, laid out neutrals first and then the spectrum: black, gray, white, red,
pink, orange, yellow, green, blue, violet, brown. `violet` IS the purple and
keeps its name, because documents store token names and a rename is a migration
that can only lose.

**Nine are pairs**, an ink (`c-*`) and its paper (`s-*`). That pairing is what
makes a coloured note a slip laid on the page rather than a block of paint, and
every ink is tested against every paper at 4.5:1 — 81 combinations per world,
because a text colour is the user's choice and any ink can land on any slip.

**Two are not.** Black and white mean themselves rather than naming a hue: a
black fill has to be black and white text is only white, so their ink and paper
are one value and the hue grid cannot hold them. What is guaranteed instead is
that one of the two always reads on any slip, in either world, and
`readableInkOn` returns it without being asked — which is why a black sticky
comes out legible rather than needing to be fixed.

The values were searched rather than picked. Brown's paper is the
best-separated tan that all eleven inks still read on; constrained only by
contrast, the search returned a pale olive, which separates beautifully and is
not brown. Pink is a deep raspberry because a lighter one sits on top of the
guide magenta.

**A literal colour** may also be set, from the wheel or the eyedropper. It does
not follow a theme — there is no second value to switch to — and its contrast
cannot be proven at build time, so the picker states the ratio against the
ground the colour will actually sit on and says when it falls below 4.5:1. A
warning, never a refusal: somebody matching a brand colour is making a choice
the panel is not entitled to overrule.

### Named Rules

**The Ground Is Not A Control Rule.** The quadrille is ruled below the 3:1
non-text floor on purpose, and the build asserts a _ceiling_ as well as a floor:
the fine rule stays under 2:1 against the page and the decade rule between 1.2:1
and 2.5:1. Ground you cannot ignore is a cage the content has to fight. A future
"improve contrast" pass must not raise it.

**The One Red Rule.** There is exactly one corrective red in the world.
Content red is held more than 30 units of sRGB distance away from it, because
when the two sat close a red slip on the page read as a correction mark and the
record panel offered the correction hue as an ordinary choice.

**The Token Name Rule.** Documents store token _names_, never colour values. The
one place a name becomes a CSS variable is `scene/style-tokens.ts`. This is
load-bearing: a theme can change without touching a single saved board, and any
restyle must preserve it.

**The Never-Black Rule.** Ink carries a blue cast and never reaches `#000000`;
the build fails if the blue and red channels of ink are within 4 of each other.

## Typography

**Body Font:** system UI sans (`ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`)
**Record Font:** system mono (`ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono`)
**Object Faces:** the same sans, plus `ui-serif, Georgia` and the system mono,
offered per object through the record panel's face field.

**Character:** the faces are the machine's own. Local-first forbids a font
request, so the type personality comes from scale, rhythm and tabular numerals
rather than from a licence. Every readout that contains numbers sets
`font-variant-numeric: tabular-nums`, so counts, zoom and field values read as
columns rather than as ransom text.

### Hierarchy

- **Display** (400, 22px, 1.3): free text objects on the board — the largest type
  in the system, and it belongs to the user's content, not to the interface.
- **Body** (400, 15px, 1.35): sticky note text.
- **Shape Label** (400, 14px, 1.3): text inside a shape, centred, inset per shape
  geometry rather than by a shared box.
- **UI** (400, 15px): menu items, notices, toasts, frame titles, alt-text editor.
- **UI Small** (400, 13px): flyout items, connector labels, fallback and unknown
  object bodies.
- **Record** (400, 12px, mono, 0.02em): the record line, the record panel's
  subject and field labels, slider readings, keyboard shortcuts, the wheel-mode
  value. Lowercase, never uppercase-tracked.
- **Title** (600, 17px): the one heading a gate or a sheet carries — "This board
  has a password".
- **Headline** (600, 19px): the wordmark on the front door, beside the mark.

In the stylesheet these are seven steps of `--of-type-*` — `record` 12,
`ui-small` 13, `control` 14 (buttons, fields and a shape's label), `ui` 15
(which is also a sticky's body), `title` 17, `headline` 19, `display` 22.

### Named Rules

**The Twelve Pixel Floor.** 12px is the smallest functional text in the system,
shortcuts and readouts included. Nothing a user must read goes below it. It was
eleven until 2026-09-19; a floor is the least you will accept, and this one had
become the size of nearly everything, which is a different thing.

It was also written down a week before it was true: this file said twelve while
27 rules in the stylesheet still said eleven, because a floor in prose is a
floor nothing measures. `design-tokens.test.ts` now reads every absolute
`font-size` in the stylesheet and fails below 12px. Its one exemption is a
specimen — the format bar's small-size button, drawn at the size it applies.

**The Ramp Rule.** Every interface size names a step of `--of-type-*`, and
`design-tokens.test.ts` fails on a literal. Text INSIDE an object scales in `em`
from the object's own size and is not on the ramp — that is the user's material.
The only exemptions are the format bar's size specimens, each drawn at the size
it applies.

**The Mono Is A Record Rule.** Mono marks records and measurement — counts, zoom,
field values, shortcuts — and nothing else. It is never applied to make something
look technical.

**The No Request Rule.** No webfont, ever. Local-first means the page loads with
no font fetch; the stacks above are the faces.

## Layout

The board is edge to edge and owns the viewport; chrome is a set of absolutely
positioned overlays that are click-through except where they paint.

- **Left margin gutter** — the creation rail, vertically centred, 20px
  (`--of-gutter`) from the edge, 50px square tools in a rail with 5px of
  padding and a hairline.
- **Top centre** — notices and toasts, 20px from the top, capped at
  `min(720px, 100vw - 140px)`.
- **Bottom left** — the record line, offset 80px to clear the rail's real
  footprint and its margin, 20px from the bottom.
- **Bottom right** — the zoom cluster, 20px from both edges.
- **Floating** — the record panel, placed beside the selection with a 42px gap
  (clear of the connection points, which reach 38px out from the edge),
  preferring the selection's right edge, falling back to its left, then above or
  below, always clamped inside the viewport and clear of the rail (84px).

**The interface sits on the page's own rule.** `GRID_SIZE` is 10 world units and
the quadrille draws it, so the chrome measures itself in the same steps — every
height and offset is a multiple of ten. A control's edge lands where a rule
does, and the apparatus shares the rhythm of the thing it sits on instead of
floating at sizes nobody chose.

| Token         | Size | What it is                                            |
| ------------- | ---- | ----------------------------------------------------- |
| `--of-step`   | 10px | the rule, and the gap between things on a line        |
| `--of-hit-sm` | 30px | a secondary control inside apparatus                  |
| `--of-hit`    | 40px | anything you operate: a field, a button, a record row |
| `--of-hit-lg` | 50px | a list row, a primary action, and a creation tool     |
| `--of-gutter` | 20px | from the viewport edge                                |

`--of-hit-lg` clears the 44px AAA target with room over; `--of-hit-sm` is
comfortably past the 24px AA floor rather than sitting on it. **Board content
keeps its own sizes** — a sticky is still 15px and a text object still 22px,
because that is the user's material and changing it would restyle every
document ever saved.

**Spacing rhythm** runs on even small steps — `--of-space-2/4/6/8/12/16` below
the rule, `--of-step` and `--of-gutter` on it: 2px between sibling controls, 6px
of padding inside apparatus, 10px between a label and its value, 20px from the
viewport edge.

**The Even Step Rule.** Every padding, margin and gap from 2px to 20px names a
step, and `design-tokens.test.ts` fails on a literal. Sixteen values were in use,
and a 3, 5, 7 and 9 beside the 2, 4, 6 and 8 they were meant to be was drift
rather than a decision; they rounded up, onto the scale. Above 20px a length is
a size, not rhythm. Tool icons are 21px inside a 50px target; secondary icons are
16–17px; the arrow in a tool's options strip is 10px.

**World rhythm** is the quadrille: `GRID_SIZE` is 10 world units, snapping lands
on it, and the decade rule marks the line the user is aiming at.

**Responsive.** Two breakpoints, both structural rather than cosmetic. Below
**820px** the two bottom clusters would collide, so the record line un-offsets to
12px and drops its counts, and the zoom cluster drops its slider — both are
readouts and coarse controls the canvas itself already provides; the controls
with no other route stay. Below **560px** the record line moves above the rail
entirely (64px from the bottom).

### Named Rules

**The Board Is The Product Rule.** Chrome occupies margins and corners only. No
standing panel taxes board space for something that is only relevant while
something is selected.

## Elevation & Depth

Almost flat. Depth is carried by tonal layering — desk, page, panel — and by
hairline margin rules. There are exactly two elevations, and they mean different
things: apparatus is _printed near_ the page, and content slips _sit on_ it.

### Shadow Vocabulary

- **Contact** (`--of-shadow`):
  every piece of chrome — rail, record line, zoom cluster, record panel, menus,
  flyouts, notices, toasts. Just deep enough to separate apparatus from the ruling.
- **Slip** (`--of-slip-shadow`):
  deeper and tighter. The one place the world asks for physical depth — a placed
  object lying on the rule rather than printed into it.
- **Pressed index** (`--of-pressed-shadow`): the selected
  item in a segmented control, lifted off its recessed bed.

### Named Rules

**The Apparatus Rule.** Chrome is page apparatus, never a floating card. It takes
the page's own stock, a hairline margin rule and the contact shadow. A white
capsule with a heavy blur over the board is the failure mode this world exists to
refuse.

**The One Slip Height Rule.** Every placed object shares the one slip shadow, so
everything on the board sits at the same height above the rule.

## Motion

**Entries are set down on a page.** This is a computation pad where every mark
is a record, so the one authored moment belongs to the surface whose whole job
is "here is what you have written down" — the board ledger on the front door,
settling in a row at a time as if inked. Nothing else there moves.

Everything else is feedback or continuity, and there is not much of it:

- **A sheet comes out of the line it belongs to.** The account and share sheets
  rise 4px with `transform-origin: bottom left`, so they read as pulled from
  the apparatus rather than pasted over the board.
- **A copied link says so where the click landed.** A 600ms accent wash on the
  row, not a toast: the acknowledgement belongs where the action was, and this
  is a control somebody uses twice and never again that session.
- **Beds transition, they do not snap.** 140ms on hover and active states, and
  the same for a swatch's selected ring and a selected table cell's — the ring
  arrives rather than appearing.
- **A surface comes out of the thing that opened it.** The colour picker is
  pulled from the swatch grid, the table's colour bar from the table's top
  edge. Both use the sheet's raise-and-fade, because a surface that simply
  appears beside a control leaves you to work out the relationship yourself.

Timing is `--of-quick` (140ms) for feedback, `--of-settle` (240ms) for the
ledger and `--of-hold` (600ms) for an acknowledgement that stays where the
click landed, on `cubic-bezier(0.16, 1, 0.3, 1)` — a confident arrival. **No bounce:**
a ledger entry does not overshoot. The stagger (`--of-stagger`) is 28ms and capped at six rows,
because an eleventh row arriving eleven beats late is a list that feels slow,
which is the opposite of what a stagger is for.

### Named Rules

**The Reduced Motion Rule.** Reduced motion means fewer and gentler, not none.
Under the preference every moving animation is re-pointed at a fade; the colour
and opacity that carry FEEDBACK stay. An interface that stops acknowledging a
copied link under that setting has traded an accessibility preference for a
loss of information. `motion.test.ts` asserts it against the real stylesheet —
and reads every `prefers-reduced-motion` block, having first been written to
read only the first one, which was the tool tip's.

**Nothing loops.** There is no idle animation anywhere in this product.

## Names

A person's name is arbitrary-length content on a fixed-height control, and this
world has two places that carry one: the account chip on the front door and the
same chip in the record line. Both cap it, ellipsise it and forbid wrapping,
because "Muqtadaa Miandara" wrapped to two lines, grew the record line to two
rows, and starved the board title beside it down to `U…`.

Avatars are `flex: none`. A flex child with no basis becomes an ellipse when
its row is tight, which is what a long name did to one.

## Shapes

Corners are small and get smaller the closer a form is to the page. Anything that
reads as _stock laid on the page_ — sticky notes, frames, colour swatches — is cut
at **2px**, essentially square. Apparatus that lives in the margins — rail, record
line, zoom cluster — is **4px**. A control you press — a button, a field, a
menu item, a segmented bed — is **6px**, and an item nested inside a bed takes
the step below (4px), so the curves stay concentric. Overlays that appear over
the board without belonging to it — menus, flyouts, notices, toasts — are
**10px**. Round is spent on grab points: connection points and endpoints, with
the rotate grip and the lock badge on a softer 25%.

**The Radius Scale Rule.** Every corner names a step of `--of-radius-*` in
`:root`; `design-tokens.test.ts` fails on a literal. The 5–8px band this file
used to describe was four different numbers for one idea.

Borders are hairlines: 1px `panel-border` on apparatus, 1px `control-border` on
anything whose edge you must see to operate it, 1px dashed `panel-border` on
absent or unreadable content over a 45° hatched fill. The selection frame is a
1.5px accent outline drawn once per selection, never per object.

Icons are drawn, not typed: an inline 24×24 set at a single 1.6 stroke weight,
round caps and joins, inheriting `currentColor` so active and hover states are
pure CSS. There is no icon font and no icon library. The set is `controls/icons.tsx` —
a leaf, so a view can reach it — and an `<svg>` anywhere else must be drawing
content (a shape, a line, a pointer, a specimen), which `controls/icons.test.ts`
holds. Letters that ARE the subject stay letters: the format bar's A− and A+
are type specimens, and "3 × 4" is a readout.

## Components

### Tool Rail

Three runs, with a ruled divider between each, and each a labelled group for a
screen reader: **navigate** (select, hand), **make** (sticky, text, shape,
frame, connect, table, code, image) and **annotate** (comment). Image is made
like everything else in its run; it is a button rather than a mode only because
it needs a file first. Selection actions are not in the rail.

Tools are 50px squares (`--of-hit-lg`, a whole decade of the rule; the AA 2.5.8
target minimum is 24, and a tool reached for constantly deserves more than the
floor) with 21px icons, muted ink at rest, ink on an accent wash on hover, and
the page's colour on a **filled ink bed** when armed — different in kind from
hover, not only in hue, so the tool you are holding reads at a glance. The pair
is measured off the rule in `design-tokens.test.ts`. The rail is centred in the band between the
top gutter and the record line and never crosses either: as the window
shortens the tools step down a decade at a time — 40px below 720 tall, 30px
below 604 — and only below 494 does the rail scroll, because a scrolling box
clips the tips.

Shape and Table have options. Pressing the ARMED tool opens them; a 12px strip
in the rail's padding, beside the tool and never inside it, is the pointer's
shortcut to the same menu. Opening moves focus in; Escape or a press elsewhere
closes it and hands focus back. The shape menu walks with the arrows; the size
grid is one Tab stop of 24px cells that the arrows resize, read out as
"4 columns × 2 rows". U still cycles the shape kind; nothing on the rail does.

### Tool Tip

The label, not a standing caption: eleven standing captions were most of the old
rail's height. Ink-filled, page-coloured text at 12px, 6px radius, 10px to the
right of the tool, fading in over `--of-quick` (140ms) and suppressed under
`prefers-reduced-motion`. It appears on **hover and on keyboard focus** — a
tooltip only a mouse can summon is not a label. The shortcut inside it is 12px
mono in decade-rule grey.

### Tips on Everything Else

Every other control that needs a word says it the same way: the label in ink,
page-coloured 12px text at the control radius, above the control (the zoom
cluster hangs its tips from their right edge so none leaves the window). It
answers keyboard focus at once and a resting pointer after `--of-dwell`
(400ms), so a pointer crossing the chrome is not a flurry. It is `data-tip`
on the control, drawn by the stylesheet, with the same text as an
`aria-description` — which is what the browser's `title` had been doing for
assistive tech while showing sighted keyboard users nothing, on forty-two
controls. `title` survives only where it reveals content: an ellipsised field
label and a comment pin's excerpt.

### Record Line

The bottom-left readout: undo/redo actions, ruled dividers, object and selection
counts, zoom percentage, and the AGPL source link (underlined by a 1px
`currentcolor` border, going accent on hover). All 12px mono, muted ink, with
counts bolded to 600 in full ink. Its counts are the first thing dropped on a
narrow viewport.

### Zoom Cluster

Bottom-right, mono throughout. 30px buttons (`--of-hit-sm`) carrying 16px
icons, a ruled separator, a wheel-mode value at 12px (mono and small so it reads
as a _setting_ beside its icon, not a panel title), a 104px measurement slider
and a 60px, 13px tabular-numeral percentage that becomes an inline editor on an accent-soft bed with a 1px accent
outline.

### Icon Buttons

A glyph on no ground that takes a bed when you reach for it: 30px
(`--of-hit-sm`) at its smallest, muted ink at rest, ink on the hover wash,
accent on the accent wash when pressed (the state an active tool takes), and
correction red on hover only when it removes something. The record line's
history, the zoom cluster, the arrange and format bars, the record panel's
remove and the front door's row actions are all this one control; six private
versions at 24, 26, 28 and 30px were folded into it, and the three under 30
were under this world's own target.

### Measurement Sliders

Instruments, not consumer volume controls. A 3px square-ended decade-rule track
with a 4×14px ink index — a position on a scale. The saturated filled track and
large round knob of the stock component was the loudest remaining toy tell next
to a ruled page.

### Record Panel (Inspector)

The signature component. A 360px panel on panel white that floats beside the
selection and exists only while something is selected, cut from the one
contextual surface (10px, below).

**Its head names the thing.** The type as a title in the interface's own
voice (15px, 600, ink — "Evidence", "Journey stage") with what the object says
beneath it in one muted line; a mixed selection reads "2 objects" over what it
is made of ("sticky · shape"). It used to be the type id in 12px muted mono —
the faintest text in the panel, on the line that should carry the most — and
this is the one place the panel can show that a note and a piece of evidence
are the same object with a different payload.

**A record comes before its appearance.** A type that carries semantic fields
gets two bands, named as specimen labels in the front door's register —
`record` above, `appearance` below — so the half that means something and the
half that dresses it no longer share one grammar. An empty record field has a
dashed edge and an "e.g." example in italic, so an unsourced slip never reads
as sourced.

Each property is a record row: an 82px right-aligned mono label column and a
value column, 40px (`--of-hit`) minimum row height. The width is arithmetic,
not taste: 82px holds eleven 12px mono characters, so a type-declared label
such as "participant" is never clipped into a different word, and what is
left must still take a full row of the swatch grid. `design-tokens.test.ts`
does that sum on every build.

**Each word names one thing.** The colour targets are surface, text, outline
and label; "fill" is only the none / tint / solid row and "dash" the line's
pattern — they used to share "fill" and "line" between two controls each —
and vertical alignment is "vertical", not "down". A new object's colour is
marked even though nobody chose it: each view declares the colour it is drawn
in (`defaultColor`), and a test renders every one to hold it to that.

**A keyboard crosses it.** Delete is last in the panel's order, drawn in its
top corner; each radio row is one Tab stop whose arrows move the choice; every
option is at the 30px secondary target.

**It gets out of the way.** A menu sits over it (`--of-z-menu`), and holding
Shift — building a selection — makes it step aside, faint and letting the
pointer through, because the next object is usually under it. Colour and
opacity preview on the selection while they are aimed and write once, when
the gesture ends.

**Which fields appear comes from the registry** (`capabilities.styleProps`), never
from a hardcoded list; adding a property to an object type surfaces it here with
no change to the panel.

### Swatches and Segmented Controls

Colour swatches are 30px squares at 2px radius with a `control-border` hairline,
selected by an ink border plus a 2px inset panel ring. They are index-slip stock,
not paint dots: saturated circles read as a paint app, and the page already
speaks the language of rectangles.

Eleven colours and the way out of them no longer fit a line, so they are a
**6x2 grid** — a block you read as a palette. The objection was always to the
accidental 5 + 2, not to two rows.

An **ink swatch is a specimen**: the letter in that ink, on that ink's own slip,
which is the pair the palette tests. The two neutrals take the other neutral,
because their ink and paper are one value and `white` on `white` is an empty
square — which is what the first build of this grid shipped.

**One palette, and a target.** Where more than one property can take a colour,
the control names what it paints rather than repeating the grid: the record
panel for surface and text, a table's bar for fill, text and rule. Three grids
of eleven is thirty-three swatches you have to count columns to navigate, and
in the record panel it also made a floating panel 68px taller — which covers
board, and covered an object somebody then could not pick up. The targets come
from the registry's `styleProps`, so a type declaring one colour gets no
selector: a choice of one is not a choice. Segmented choices sit on a recessed desk-grey
bed at 7px radius; the selected item is panel white with accent ink and the
pressed-index shadow.

### Context Menu

Panel white, 10px radius, 196px minimum. Items are 15px UI text in 40px
(`--of-hit`) rows at 6px radius, taking the accent wash on hover, with shortcuts
at 12px mono in muted ink. Groups are separated by a hairline margin rule.

### The Front Door

`/` is the entry surface — the only page in the product that is not a board,
and it is still the page. Ruled page stock in both weights, and one sheet of
apparatus divided by a rule into a board ledger and sign-in.

It was neither of those things when first built: a flat grey ground carrying
two same-size panels of white side by side, which is the neutral void this
world refuses meeting the card scaffold it refuses, on the first screen anybody
sees. Ruling it and collapsing the panels into one sheet is what made it belong.

- **Ledger rows** — title in UI sans, "how long ago" in 12px mono with tabular
  numerals, divided by the margin rule, taking the accent wash on hover. A time
  is a measurement, so it is set as one.
- **Specimen labels** — section names are 12px mono, lowercase, tracked, muted:
  the same register the record panel uses to name its subject.
- **Ground** — tiled `linear-gradient` with `background-size`, never
  `repeating-linear-gradient`, whose stops accumulate in floating point across
  the box and band into visible plaid at the 10px pitch.

### Sharing

A sheet above the record line, the same shape as the account sheet. Two link
rows at 50px (`--of-hit-lg`) — the largest target, because this is the one
control in the product where hitting the wrong one has a consequence — each
naming what it gives away in the second line, at the 12px functional floor.

**View-only is a record, not a badge**: 12px mono on page stock with a hairline
and the apparatus radius, sitting in the record line beside the other readouts.
A pill would have been the third fully-round thing in a world where round means
"grab me".

That refusal was written down and then broken anyway: the workspace filters
shipped as fully-round pills, and the action beside them as a fourth. Both are
segmented-choice shapes now. A rule recorded in this file is not a rule the
next surface inherits automatically — it has to be applied.

### Board Objects

- **Sticky** — content surface with its own ink, 13px padding, 2px radius, the
  slip shadow. 15px/1.35.
- **Text** — transparent, 22px/1.3, 0.4 opacity while empty.
- **Shape** — SVG stroke and fill from the content pair, with a centred 14px label
  inset per shape geometry.
- **Frame** — a 1px `panel-border` rectangle at 2px radius with its title _above_
  it in 13px muted ink, counter-scaled and never clipped.
- **Connector** — a drawn path with a 12px label that knocks itself out of the
  ground with a 4px desk-coloured paint-order stroke.
- **Image** — 4px radius, `object-fit: fill`, with dashed hatched placeholders for
  loading and correction-red ones for missing.

### Text That Does Not Fit

Every object that holds text clips it at its own edge and marks the cut with an
ellipsis. Shape labels used to spill instead — the one type that did — which is
not just an inconsistency: an object whose text runs outside its bounds
disagrees with culling, hit testing and marquee selection, all of which ask the
registry for the extent and get the shape.

The mark is a real line clamp, and the number of lines is derived **in CSS**:
`round(down, 100cqh / 1lh, 1)` against a `container-type: size` parent. The box
knows its own height and the text knows its own line height, so nothing is
measured in JavaScript and no copy of the padding or the font size exists to
drift when this file's numbers change.

The fix for a clipped object is the gesture, not the panel: **double-click the
bottom handle to fit the height to the text, the right handle to fit the
width**. The side handle for the axis being fitted, matching the table
divider's double-click exactly — one vocabulary for "make this the size of what
is in it."

### Arrange Bar

Two or more objects selected raises a bar above the selection on the chrome
layer: six alignments, a rule, then two distributions. Align works on the
selection's own bounding box — align-left goes to the leftmost edge among the
things selected, not to the board or to a frame. Distribute equalises the
**gaps**, leaving the outermost two exactly where they are, so it reads as
tidying rather than moving.

Distribution is disabled below three rather than hidden, the same call the code
box's format button makes. Icons are a rule plus bars that have landed on it,
at two different lengths: the shape that separates "left" from "centre" is the
same shape that separates the operations.

The bar is told where the options panel is and stays off it. Two floating
surfaces placed by separate arithmetic will eventually want the same space, and
on a selection too wide for the panel to sit beside, the panel takes the whole
band above — which is where a bar anchored to that selection wants to be.

### Connector Bends

An orthogonal or curved connector carries a third draggable point at the middle
of its route: a hollow, squared handle rather than the filled dot an end gets,
because it shapes the line between the ends and is not one of them. A straight
route has none — there is nothing to bend.

The elbow of an orthogonal route slides ALONG the run only; its middle segment
is perpendicular to the run, so there is no second axis to move it in. A curve's
apex moves freely and the curve passes exactly under the handle, because a line
that only follows part of the way slides out from under the pointer and reads as
broken.

### Cursors on an Object

An object shows the ARROW at rest and `move` once selected. It never shows a
caret unless a caret is what you will get: there was no cursor rule at all, so
it fell through to `auto`, and `auto` over selectable text is an I-beam — every
note and label promised typing on hover and gave a selection on click. The
caret now appears only inside an editor, where it is the truth.

### Locked Objects

A lock stops the gesture, not just the command. Pressing a locked object
selects it and starts nothing: it used to follow the pointer across the board
and snap back on release, because the handler refused the move only after the
drag had run — which reads as the app dropping a change rather than as the
object being held.

A selected locked object carries a **padlock badge** above its top-left corner,
counter-scaled like every other piece of chrome. It answers the question the
missing handles raise; a selection with no grips and no explanation reads as a
bug.

### Cropping an Image

Double-click an image to trim it. The grips are **corner brackets and edge
bars**, not squares: a square is what a resize handle looks like, and the two
gestures do different things to the same object. Crop mode REPLACES the resize
handles and the connection points rather than adding to them — two gestures
offering a grip in the same place is a coin toss the user has to call.

The handles shrink the visible window and the frame shrinks with it, so what
you see is the object's size — and the pixels that survive do not move, which
is the whole point: a crop that rescales what is left feels like stretching a
rubber sheet rather than using scissors.

Crop mode belongs to the selected object and ends the moment the selection
changes or Escape is pressed.

A trimmed image offers **reset**, which grows the frame back as it restores the
window. Restoring one without the other would squeeze the whole picture into
the cropped box.

Images also take a stroke, defaulting to `none` — a shape and a connector are
lines by nature and default to `medium`, but giving every image already on a
board a border nobody asked for is a change to somebody's work.

### The Rotate Grip

A **glyph**, not a dot: a 15px curved arrow on a soft-radius chip above the top
edge. It was a circle with an accent ring, which is precisely what a connect
point is, sitting a few pixels away on the same edge — silhouette alone now
separates them before the glyph is even resolved.

### One Contextual Surface

Everything that floats over the board attached to something shares one shell:
panel white, a 1px margin rule, **10px**, and the contact shadow. The record
panel, a context menu, a colour picker, a text format bar, a table's colour bar
and its row and column controls, and a code block's language menu are all that
one class.

They were six pieces of stock with four radii and two grounds, because each was
written where it was needed rather than from one place. The record panel was
6px as the system's nominal radius, and being the signature component turned
out not to be a reason to be the one surface that does not match the others.

**Placement is one function too.** `scene/anchoring.ts` takes what a surface
belongs beside, a list of sides to try and the window, and returns a position
clamped on both axes and clear of the rail. It is pure, so where a surface goes
is decided against numbers rather than screenshots — including the case that
used to be impossible to express: an anchor that is itself off the window.

**Apparatus belonging to an object lives in a screen-space LAYER**, never inside
the object. Inside, it is in world space: it multiplies by the zoom and is
pinned to an edge that leaves the window as soon as you zoom in, which is how a
colour bar came to be the size of a dialog at 400%. A view receives the layer as
a prop and says only what its apparatus belongs beside, as a fraction of its own
extent — the unit a divider and a comment pin already use. A view is a leaf and
never learns that a viewport exists.

Anything in that layer carries `.of-editor-chrome`, and this is load-bearing:
the canvas blurs whatever is being typed into on any press it reads as a board
gesture, and the marker is what says otherwise. It has been missed four times —
the format bar, the table's buttons, the code menu, and the layer itself — every
time presenting as a control that was visible and could not be used.
`chrome-contract.test.ts` reads it off the source now.

### Editors and Focus

Every in-place editor inherits the object's own type and drops its border,
carrying a 2px accent outline instead. Global `:focus-visible` is a 2px accent
outline at 2px offset with the apparatus radius (4px). Browser surfaces are claimed, not
defaulted: selection highlight, caret colour and thin `control-border` scrollbars.

### Notices and Toasts

Top centre, 10px radius, 15px UI text, contact shadow. Both the advisory and the failure
pair use the correction wash (`--of-danger-wash`) with a `--of-danger-edge`
hairline; the failure pair adds correction-red text.

There is no separate amber family. A notice is corrective, so it belongs to the
one red rather than to a second warm one — and the amber the banner used to
carry (`#fff6dd` on `#f0dfae`) was the stationery register this world bans,
surviving in a component the restyle never touched. It was found by documenting
the build rather than by looking at it.

## The Ruled Ground

The board's background is painted on the canvas element rather than the world
layer — a background that scaled with the transform would blur and would repaint
an enormous area when zoomed out — and offset by the viewport modulo the cell.

Three weights, because the zoom steps reach 5%:

- **Fine rule** (`rule`, 10 world units) appears at **zoom ≥ 0.7**. At 100% it
  lands every 10 screen pixels. That density is what quadrille _is_; the answer to
  it being too busy was ink, not spacing, so every weight is faint.
- **Decade rule** (`rule-decade`, 100 world units) appears at **zoom ≥ 0.12**. It
  marks the line snapping actually lands on.
- **Century rule** (`rule-decade`, 1000 world units) takes over **below zoom
  0.12**, so the page is ruled at every reachable zoom.

**The Never-Void Rule.** With only two weights both dropped out below 12% and the
board became a flat, unruled void — the neutral canvas this design exists to
refuse, appearing exactly when someone zooms out to survey the whole record. The
ground must survive every step of the zoom ladder.

## Do's and Don'ts

### Do:

- **Do** cut chrome from the page's own stock (`page`) with a 1px `panel-border`
  margin rule and the contact shadow. Apparatus, never a floating card.
- **Do** store token _names_ in documents and resolve them through
  `scene/style-tokens.ts`. A restyle must never require touching a saved board.
- **Do** keep the quadrille below the 3:1 floor, and keep the build test that
  asserts that ceiling.
- **Do** reserve `danger` for destructive and corrective meaning, and keep any new
  content hue more than 30 sRGB units clear of it.
- **Do** use mono only for records and measurement — counts, zoom, field values,
  shortcuts.
- **Do** hold functional text at 12px or above, and pointer targets at 30px or
  above (50px for tools reached for constantly). The floors moved with the
  scale; 11px and 24px were the old ones.
- **Do** let new record-panel fields arrive through the registry's
  `capabilities.styleProps`.
- **Do** give every placed object the one shared slip shadow, so the board sits at
  one height.
- **Do** make tooltips reachable from keyboard focus as well as hover.
- **Do** draw new icons on the 24×24 grid at 1.6 stroke weight with
  `currentColor`.

### Don't:

- **Don't** use cream, parchment, serif display faces, handwriting, paper texture
  or torn edges. The register is the computation pad, not the diary.
- **Don't** float white capsules with heavy blur over the board.
- **Don't** add a webfont. Local-first forbids a font request.
- **Don't** use pure black as ink, or a neutral near-black; ink carries a blue
  cast.
- **Don't** use `danger` or `guide` decoratively.
- **Don't** ship a saturated filled slider track with a large round knob; sliders
  are thin tracks with a square index.
- **Don't** raise the quadrille toward the control floor in a contrast pass.
- **Don't** add a standing panel that occupies board space when nothing is
  selected.
- **Don't** hardcode a colour value in a view; read it from the token map.
