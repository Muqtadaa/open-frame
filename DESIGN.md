---
name: OpenFrame
description: An engineering quadrille page that treats every mark on it as a record, with a second world for after hours.
colors:
  bg: "#eef2f6"
  page: "#f7f9fb"
  rule: "#e4ebf2"
  rule-decade: "#c9d6e4"
  panel: "#ffffff"
  panel-border: "#c7d2de"
  control-border: "#758596"
  ink: "#16202b"
  ink-muted: "#4e6070"
  accent: "#1450b5"
  accent-soft: "#e4ecfa"
  guide: "#b0197a"
  danger: "#a3231b"
  danger-wash: "#f9ebea"
  danger-edge: "#e0bcb8"
  hover: "#e8edf3"
  c-yellow: "#7a5c00"
  c-green: "#146045"
  c-blue: "#17529e"
  c-red: "#8a4038"
  c-violet: "#5b3ba8"
  c-orange: "#8c4715"
  c-gray: "#3f5163"
  s-yellow: "#ffe9a3"
  s-green: "#bff0d4"
  s-blue: "#cfe2ff"
  s-red: "#ffd5d0"
  s-violet: "#e3daff"
  s-orange: "#ffddb8"
  s-gray: "#dfe5ec"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.3
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.35
  shape-label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.3
  ui:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.3
  ui-small:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1
  record:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.02em"
rounded:
  square: "0px"
  slip: "2px"
  apparatus: "4px"
  panel: "6px"
  control: "7px"
  surface: "10px"
  round: "50%"
spacing:
  hair: "2px"
  tight: "4px"
  snug: "6px"
  base: "8px"
  gutter: "10px"
  margin: "12px"
components:
  tool:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "8px"
    size: "40px"
  tool-hover:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.ink}"
  tool-active:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  tool-tip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.page}"
    typography: "{typography.ui-small}"
    rounded: "{rounded.panel}"
    padding: "5px 8px"
  rail:
    backgroundColor: "{colors.page}"
    rounded: "{rounded.apparatus}"
    padding: "5px 4px"
  status:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.record}"
    rounded: "{rounded.apparatus}"
    padding: "4px 10px 4px 5px"
  zoom:
    backgroundColor: "{colors.page}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.apparatus}"
    padding: "4px 6px"
  inspector:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "9px 10px 11px"
    width: "276px"
  field-label:
    textColor: "{colors.ink-muted}"
    typography: "{typography.record}"
    width: "52px"
  swatch:
    rounded: "{rounded.slip}"
    size: "24px"
  choice-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "5px"
    size: "28px"
  choice-item-on:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.accent}"
  menu:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.surface}"
    padding: "5px"
  menu-item:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.ui}"
    rounded: "{rounded.panel}"
    padding: "6px 9px"
  menu-item-hover:
    backgroundColor: "{colors.accent-soft}"
  sticky:
    typography: "{typography.body}"
    rounded: "{rounded.slip}"
    padding: "13px"
  frame:
    backgroundColor: "transparent"
    rounded: "{rounded.slip}"
---

# Design System: OpenFrame

## Overview

**Creative North Star: "The Notebook"**

The board is a laboratory record, not a drawing surface. The register is the
engineering computation pad: cold blue-grey stock, a cyan-grey quadrille ruling
at world scale, blue-black ink that is never pure black, and one correction red
that appears only where something is being undone or removed. Content arrives as
coloured index slips laid *on* the page — the one place in the system that is
allowed real physical depth.

It refuses two things explicitly. The first is the canvas-app default: a neutral
void with floating candy chrome, white capsules blurred over the artboard. Chrome
here is page apparatus — it takes the page's own stock, a hairline margin rule and
a contact shadow just deep enough to separate it from the ruling. Three floating
white capsules at once was the single biggest reason an earlier pass read as a
toy. The second refusal is stationery: cream, parchment, serif display,
handwriting, paper texture and torn edges are the twee rendition of a notebook and
are banned. This is the pad an engineer computes on, not the diary.

Density is high and quiet. The empty board is almost entirely board; chrome sits
in the margins and the corners, and the panel that names a selection only exists
while there is a selection. Nothing decorative is ever loud enough to compete
with what the user put down.

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

Seven pairs, each an ink (`c-*`) and its paper (`s-*`): yellow, green, blue, red,
violet, orange, gray. The ink is only ever used on its own surface — a sticky's
text on its body, a shape's stroke on its fill — and every pair is tested at 4.5:1.

### Named Rules

**The Ground Is Not A Control Rule.** The quadrille is ruled below the 3:1
non-text floor on purpose, and the build asserts a *ceiling* as well as a floor:
the fine rule stays under 2:1 against the page and the decade rule between 1.2:1
and 2.5:1. Ground you cannot ignore is a cage the content has to fight. A future
"improve contrast" pass must not raise it.

**The One Red Rule.** There is exactly one corrective red in the world.
Content red is held more than 30 units of sRGB distance away from it, because
when the two sat close a red slip on the page read as a correction mark and the
record panel offered the correction hue as an ordinary choice.

**The Token Name Rule.** Documents store token *names*, never colour values. The
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
- **UI** (400, 13px): menu items, notices, toasts, frame titles, alt-text editor.
- **UI Small** (400, 12px): flyout items, connector labels, fallback and unknown
  object bodies.
- **Record** (400, 11px, mono, 0.02em): the record line, the record panel's
  subject and field labels, slider readings, keyboard shortcuts, the wheel-mode
  value. Lowercase, never uppercase-tracked.

### Named Rules

**The Eleven Pixel Floor.** 11px is the smallest functional text in the system,
shortcuts and readouts included. Nothing a user must read goes below it.

**The Mono Is A Record Rule.** Mono marks records and measurement — counts, zoom,
field values, shortcuts — and nothing else. It is never applied to make something
look technical.

**The No Request Rule.** No webfont, ever. Local-first means the page loads with
no font fetch; the stacks above are the faces.

## Layout

The board is edge to edge and owns the viewport; chrome is a set of absolutely
positioned overlays that are click-through except where they paint.

- **Left margin gutter** — the creation rail, vertically centred, 12px from the
  edge, 40px square tools in a 48px-wide rail.
- **Top centre** — notices and toasts, capped at `min(720px, 100vw - 140px)`.
- **Bottom left** — the record line, offset 72px to clear the rail's real
  footprint (48px rail + 12px margin), 12px from the bottom.
- **Bottom right** — the zoom cluster, 12px from both edges.
- **Floating** — the record panel, placed beside the selection with a 14px gap,
  preferring the selection's right edge, falling back to its left, then above or
  below, always clamped inside the viewport and clear of the rail (84px).

**Spacing rhythm** runs on even small steps: 2px between sibling controls, 4–6px
of padding inside apparatus, 8–10px between a label and its value, 12px from the
viewport edge. Tool icons are 21px inside a 40px target; secondary icons are
16–17px; the disclosure arrow is 12px.

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
things: apparatus is *printed near* the page, and content slips *sit on* it.

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

## Shapes

Corners are small and get smaller the closer a form is to the page. Anything that
reads as *stock laid on the page* — sticky notes, frames, colour swatches — is cut
at **2px**, essentially square. Apparatus that lives in the margins — rail, record
line, zoom cluster — is **4px**. The record panel is **6px** (`--of-radius`), the
system's nominal radius. Interactive beds inside a panel are **5–8px**, and
overlays that appear over the board without belonging to it — menus, flyouts,
notices, toasts — are **10px**. Only two things are fully round: the rotate handle
and connector endpoints, where roundness signals a grab point.

Borders are hairlines: 1px `panel-border` on apparatus, 1px `control-border` on
anything whose edge you must see to operate it, 1px dashed `panel-border` on
absent or unreadable content over a 45° hatched fill. The selection frame is a
1.5px accent outline drawn once per selection, never per object.

Icons are drawn, not typed: an inline 24×24 set at a single 1.6 stroke weight,
round caps and joins, inheriting `currentColor` so active and hover states are
pure CSS. There is no icon font and no icon library.

## Components

### Tool Rail

Creation only — select, hand, sticky, text, shape, frame, connect, then a ruled
divider and image. Selection actions are not in the rail. Tools are 40px squares
(the AA 2.5.8 target minimum is 24; a tool reached for constantly deserves more
than the floor) with 21px icons, muted ink at rest, ink on an accent wash on
hover, accent on accent wash when active, 0.35 opacity when disabled. The shape
slot carries a 16px disclosure that opens a two-column flyout of eight shapes.

### Tool Tip

The label, not a standing caption: eleven standing captions were most of the old
rail's height. Ink-filled, page-coloured text at 12px, 6px radius, 10px to the
right of the tool, fading in over 110ms and suppressed under
`prefers-reduced-motion`. It appears on **hover and on keyboard focus** — a
tooltip only a mouse can summon is not a label. The shortcut inside it is 11px
mono in decade-rule grey.

### Record Line

The bottom-left readout: undo/redo actions, ruled dividers, object and selection
counts, zoom percentage, and the AGPL source link (underlined by a 1px
`currentcolor` border, going accent on hover). All 11px mono, muted ink, with
counts bolded to 600 in full ink. Its counts are the first thing dropped on a
narrow viewport.

### Zoom Cluster

Bottom-right, mono throughout. Icon buttons at 16px, a ruled separator, a
wheel-mode value at 11px (mono and small so it reads as a *setting* beside its
icon, not a panel title), a 104px measurement slider and a 54px tabular-numeral
percentage that becomes an inline editor on an accent-soft bed with a 1px accent
outline.

### Measurement Sliders

Instruments, not consumer volume controls. A 3px square-ended decade-rule track
with a 4×14px ink index — a position on a scale. The saturated filled track and
large round knob of the stock component was the loudest remaining toy tell next
to a ruled page.

### Record Panel (Inspector)

The signature component. A 276px panel on panel white that floats beside the
selection and exists only while something is selected. Its head names the subject
the way a specimen label does — 11px mono, lowercase, tracked 0.02em — beside a
remove action that takes correction red only on hover. Below a hairline divider,
each property is a record row: a 52px right-aligned mono label column and a value
column, 30px minimum row height.

**Which fields appear comes from the registry** (`capabilities.styleProps`), never
from a hardcoded list; adding a property to an object type surfaces it here with
no change to the panel.

### Swatches and Segmented Controls

Colour swatches are 24px squares at 2px radius with a `control-border` hairline,
selected by an ink border plus a 2px inset panel ring. They are index-slip stock,
not paint dots: seven saturated circles read as a paint app, and the page already
speaks the language of rectangles. Segmented choices sit on a recessed desk-grey
bed at 7px radius; the selected item is panel white with accent ink and the
pressed-index shadow.

### Context Menu

Panel white, 10px radius, 196px minimum, 13px items at 6px radius with the accent
wash on hover, shortcuts at 11px in muted ink, groups separated by a hairline
margin rule.

### The Front Door

`/` is the entry surface — the only page in the product that is not a board,
and it is still the page. Ruled page stock in both weights, and one sheet of
apparatus divided by a rule into a board ledger and sign-in.

It was neither of those things when first built: a flat grey ground carrying
two same-size panels of white side by side, which is the neutral void this
world refuses meeting the card scaffold it refuses, on the first screen anybody
sees. Ruling it and collapsing the panels into one sheet is what made it belong.

- **Ledger rows** — title in UI sans, "how long ago" in 11px mono with tabular
  numerals, divided by the margin rule, taking the accent wash on hover. A time
  is a measurement, so it is set as one.
- **Specimen labels** — section names are 11px mono, lowercase, tracked, muted:
  the same register the record panel uses to name its subject.
- **Ground** — tiled `linear-gradient` with `background-size`, never
  `repeating-linear-gradient`, whose stops accumulate in floating point across
  the box and band into visible plaid at the 10px pitch.

### Sharing

A sheet above the record line, the same shape as the account sheet. Two link
rows at 44px — above the usual floor because this is the one control in the
product where hitting the wrong one has a consequence — each naming what it
gives away in the second line, at the 11px functional floor.

**View-only is a record, not a badge**: 11px mono on page stock with a hairline
and the apparatus radius, sitting in the record line beside the other readouts.
A pill would have been the third fully-round thing in a world where round means
"grab me".

### Board Objects

- **Sticky** — content surface with its own ink, 13px padding, 2px radius, the
  slip shadow. 15px/1.35.
- **Text** — transparent, 22px/1.3, 0.4 opacity while empty.
- **Shape** — SVG stroke and fill from the content pair, with a centred 14px label
  inset per shape geometry.
- **Frame** — a 1px `panel-border` rectangle at 2px radius with its title *above*
  it in 13px muted ink, counter-scaled and never clipped.
- **Connector** — a drawn path with a 12px label that knocks itself out of the
  ground with a 4px desk-coloured paint-order stroke.
- **Image** — 4px radius, `object-fit: fill`, with dashed hatched placeholders for
  loading and correction-red ones for missing.

### Editors and Focus

Every in-place editor inherits the object's own type and drops its border,
carrying a 2px accent outline instead. Global `:focus-visible` is a 2px accent
outline at 2px offset with a 3px radius. Browser surfaces are claimed, not
defaulted: selection highlight, caret colour and thin `control-border` scrollbars.

### Notices and Toasts

Top centre, 10px radius, 13px, contact shadow. Both the advisory and the failure
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
  lands every 10 screen pixels. That density is what quadrille *is*; the answer to
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
- **Do** store token *names* in documents and resolve them through
  `scene/style-tokens.ts`. A restyle must never require touching a saved board.
- **Do** keep the quadrille below the 3:1 floor, and keep the build test that
  asserts that ceiling.
- **Do** reserve `danger` for destructive and corrective meaning, and keep any new
  content hue more than 30 sRGB units clear of it.
- **Do** use mono only for records and measurement — counts, zoom, field values,
  shortcuts.
- **Do** hold functional text at 11px or above, and pointer targets at 24px or
  above (40px for tools reached for constantly).
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
