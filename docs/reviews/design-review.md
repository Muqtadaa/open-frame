# Design review — surfaces and design language

> **A running log.** Each section describes the repository as it was when that section was written. For the current state see [audit-2026-10-08.md](audit-2026-10-08.md) and [docs/architecture](../architecture/).

← [Review plan](review-plan.md) · Driven by the vendored `impeccable` skill ·
Scope: **refine, with bolder chrome allowed** (the Notebook and After Hours
worlds, the palette and the ruled ground are kept)

Run from `apps/web/` (`impeccable context` resolves `PRODUCT.md` and
`DESIGN.md` from the repo root). Mode: **Operate** for every surface except the
boot splash.

## Baseline (2026-09-24)

| Signal                         | Value                                              |
| ------------------------------ | -------------------------------------------------- |
| `impeccable detect --json src` | 56 advisory hits, all in `styles.css`              |
| — off the type ramp            | 33 (27 of them 11px)                               |
| — off the radius scale         | 19                                                 |
| — undocumented colour          | 2 (`#000`, `rgb(0 0 0 / 45%)`)                     |
| — Georgia                      | 1 (already ignored: a user-chosen content face)    |
| — grid background              | 1 (false positive: the ruled ground IS the canvas) |
| Critique snapshots             | none — the project had never been critiqued        |
| Surface contracts              | 3 of ~20 surfaces (App shell, Home, Share)         |
| `styles.css`                   | 5,454 lines, one file, 64 `--of-*` tokens          |

## C1 — make DESIGN.md true ✅

A critique scored against a document that contradicts itself is scored against
noise, so this came first. `/impeccable document` was run in **merge** mode:
narrative, North Star and named rules kept; every number re-extracted from the
code.

**The floor is 12px, and now measured.** DESIGN.md's Twelve Pixel Floor said 12
while its own component sections, CLAUDE.md rule 22, the Share contract and 27
stylesheet rules said 11. All 27 moved to 12, and `design-tokens.test.ts` now
fails on any absolute `font-size` below 12px (one exemption: the format bar's
small-size specimen). The test was broken once and watched to fail (rule 23).

**Numbers corrected in DESIGN.md** (frontmatter and prose):

| What                   | DESIGN.md said      | Code / now documented                  |
| ---------------------- | ------------------- | -------------------------------------- |
| Tool size              | 40px in a 48px rail | 50px (`--of-hit-lg`), 5px rail padding |
| Chrome offset          | 12px                | 20px (`--of-gutter`)                   |
| Record-line offset     | 72px                | 80px                                   |
| Record panel           | 276px, 6px, 52px    | 360px, 10px surface, 82px label column |
| Record row height      | 30px                | 40px (`--of-hit`)                      |
| Panel gap              | 14px                | 42px (clear of the connection points)  |
| Context menu items     | 13px                | 15px in 40px rows                      |
| Notices and toasts     | 13px                | 15px                                   |
| Share link rows        | 44px                | 50px (`--of-hit-lg`)                   |
| `spacing.gutter` token | 10px                | 20px; `step` 10px added                |

Also: the swatch-grid test read "seven swatches" against a 6×2 grid — it now
reads the column count from the grid itself; CLAUDE.md and the architecture docs
pointed at `canvas/views/`, which does not exist (`src/views/`); the
`.impeccable/design.json` sidecar was regenerated (components, motion tokens,
named rules and do/don't lists re-derived from DESIGN.md).

**Detector after C1:** 56 → **29** advisory hits (19 radius, 6 type, 2 colour,
plus the two known false positives).

## Screenshot baselines ✅

`apps/web/e2e/surfaces.visual.spec.ts` photographs nine surfaces in both worlds
(18 goldens): front door, empty board, selection + record panel, context menu,
tool tip on keyboard focus, sign-in sheet (the shell the share sheet shares),
shape flyout, comment composer, password gate. `pnpm --filter @openframe/web
test:visual` compares; `--update-snapshots` accepts. Stable across
`--repeat-each=3`. A separate Playwright project, not a CI gate yet: the goldens
were taken in the development container and must be regenerated in CI's image
first (review plan, B4).

Found by looking at them:

- **Unstyled buttons, visible**: "Close" and "Comment" on the comment composer
  and "Open the board" on the password gate are browser-default buttons — the
  `.of-button` gap below, on screen.
- **The record line runs under the zoom cluster** on a signed-in shared board at
  1280px: the connection status, avatar and name overlap the "zoom" label. The
  `max-width` reservation in `.of-status` does not hold once presence and the
  account chip join the line. (C3 #3.)

## C2 — extract the system ✅

### Done

- **C2.1 — one button** (`.of-button`, `--primary`, `--ghost`). The twelve
  unstyled uses now render as designed; the account sheet's submit, the share
  sheet's open and the record panel's action fold into it, deleting three
  private implementations. Hover on primary mixes the accent toward the ink, so
  it deepens on the page and brightens at night from the same rule. The password
  gate's submit sits at `--of-hit` (40px). Goldens updated for the four
  screenshots that changed (composer and gate, both worlds); nothing else moved.

- **C2.2 — one field** (`.of-input`, `--large`). Four text-field implementations
  (record panel, account sheet, comment composer, workspace bar) become one,
  on `control-border` — the record panel's fields had been drawn with the
  margin rule at ~1.5:1, below the 3:1 a boundary you operate needs (WCAG
  1.4.11). 30px in a panel, 40px (`--large`) in a sheet or gate, with a
  matching `.of-button--large`, so the password gate's field and button now
  share one height. Goldens moved on the front door, sign-in sheet, composer
  and gate, and nowhere else.

- **C2.3a — the radius scale.** Seventeen values onto seven steps in `:root`
  (`hair` 1, `slip` 2, `apparatus` 4, control 6, `surface` 10, `grip` 25%,
  `round` 50%, plus `capsule` for the one elongated grab point). The 5–8px band
  collapses to 6px; nested beds take the step below so curves stay concentric;
  the mentions bell's pill — against DESIGN.md's own refusal — goes to 4px.
  `design-tokens.test.ts` now fails on any literal radius (broken once with a
  stray `9px`, watched to fail).
- **The screenshot net was too loose.** At Playwright's default per-pixel
  tolerance (0.2) the whole radius change registered on one surface of
  eighteen. Tightened to 0.02 — stable across three repeats against the
  unchanged stylesheet — and it then showed the change on ten, only at the
  corners that moved.

- **C2.3b — the type ramp.** 106 raw pixel sizes onto seven steps of
  `--of-type-*` (record 12, ui-small 13, control 14, ui 15, title 17, headline
  19, display 22), named for what they carry. The goldens did not move: an
  exact refactor, which is what they were added to prove. The 12px floor test
  was rewritten to READ the ramp — left as it was, it only checked literal
  `px` and would have passed on a stylesheet with none left. A new check fails
  on any literal interface size; `em` (content scaling inside an object) and
  the format bar's size specimens are the only exemptions. All three checks
  broken once and watched to fail.
- **Detector: 56 → 6**, every remaining hit deliberate: the colour picker's
  spectrum (`#000`, a black-to-transparent wash that IS the definition of
  value), the two size specimens, Georgia (a content face a user picks), and
  the ruled ground.

- **C2.3c — the layers.** Ten bare z-indexes (1–100) become ten named layers
  in `:root`, split between the ones that order things within one stacking
  context (lifted, preview, guide, grip, tip) and the application's own (search,
  chrome, panel, apparatus, gate). Values unchanged, goldens unchanged; a
  literal fails the build (broken once with a stray `9`).
- **Found:** `--of-z-search` (8) sits UNDER `--of-z-chrome` (10), so a top-centre
  notice — the read-only banner of a quarantined board, say — paints over the
  search field it shares the top of the screen with. Search also sits 16px
  from the top where every other piece of chrome takes the 20px gutter. A
  behaviour change, so it goes to C3 #4 rather than riding a refactor.

- **C2.4 — one clock, one sheet, one notice.** Motion runs on `--of-quick`,
  `--of-settle`, `--of-hold` and `--of-stagger`: the tool tip's private 110ms
  ease-out and the sheets' 160ms go to the 140ms token beside them, and a
  duration outside the token block fails the build. The account and share
  sheets were byte-identical rules under two names and are one `.of-sheet` —
  at the surface radius, because they float over the board and were the only
  floating surfaces at 6px. The toast was the notice's failure pair with
  every declaration repeated, and is now `of-notice of-notice--danger`.
- **Two survey findings were false.** `interaction/tool-cursor.ts`'s literal
  ink is a fallback; the cursor reads the live `--of-ink`/`--of-panel` through
  `useCursorInk`, so it follows After Hours. `controls/Swatches.tsx`'s
  `#000000` is the picker's seed before a document has loaded. Neither changed.
- **QA note:** `brand.spec.ts:72` ("keeps the board out of the tab order while
  it is covered") fails under four parallel workers on the unchanged branch
  and passes serially — a timing-sensitive test, for Track B.

- **C2.5 — the spacing scale (full snap, as decided).** 203 padding, margin and
  gap values onto `--of-space-2/4/6/8/12/16` plus `--of-step` and `--of-gutter`.
  Odd values rounded up (3→4, 5→6, 7→8, 9→10), 13→12, 14→16, 18→20; above 20px
  a length is a size and stays literal. Every golden moved, as expected, and
  one batched look found layout intact on all eighteen; the record panel's
  width arithmetic still holds. A literal in range fails the build (broken once
  with a stray `7px`). Full e2e: 327/328, the one failure the known flake.
- **Found (pre-existing, in the baseline golden):** the record panel paints OVER
  an open context menu — "Promote to evidence", "Promote to insight" and three
  shortcuts are clipped under it. Two floating surfaces on the same layer, the
  later one winning. Goes to C3 #1/#4.

- **C2.6 — one icon button.** Six private versions (record line, front-door
  row actions and pin, record-panel remove, arrange bar, format bar, zoom
  cluster) at 24/26/28/30px, two hover grounds and three disabled opacities
  become `.of-icon-button` with `--on`/`aria-pressed` and `--destructive`. The
  three under 30px rise to the secondary-control target. The record line's
  exit stays its own control: a labelled navigation link with its own motion
  is a different intent. Guarded: the primitive holds 30px and the retired
  classes stay retired (broken once at 24px).

- **C2.7 — icons drawn once.** The set moves from `ui/` to `controls/icons.tsx`,
  a leaf every layer may use — which also retires two of Track A's layering
  leaks (canvas importing `ui/` for icons). The workspace bar's private plus
  (1.8 stroke) and the colour picker's dropper join the set; the table's typed
  `+`/`−` steppers become drawn icons on the icon button, rising from 24px
  bordered buttons to the 30px target. Specimens stay what they are: the
  swatch rule mark and colour wheel, the format bar's A−/A+, "3 × 4". A test
  holds that any other `<svg>` is on a named list of content drawings (broken
  once by restoring the private plus).

- **C2.8 — tips a keyboard can summon.** Forty-two controls were labelled with
  the browser's `title`, which never appears on focus. They carry `data-tip`
  (drawn by one stylesheet rule on hover after `--of-dwell` and at once on
  `:focus-visible`) plus the same text as `aria-description`, preserving what
  `title` gave assistive tech. The three copies of the platform-modifier sniff
  are one `MOD_KEY` beside `formatShortcut`. Guarded: no `title` outside the
  two content cases, and no tip without its description (broken once); an e2e
  test in the CI suite shows the tip on keyboard focus and holds it back for a
  resting pointer until the dwell (broken once by removing the focus rule);
  a new golden pair shows the zoom cluster's tip hung inside the window.

### C2 closed

Everything the backlog listed is done, except by decision the split of
`styles.css` into layer files, which waits until C3 has settled which rules
survive. Detector 56 → 6, every remaining hit deliberate. DESIGN.md's component
tokens and the `.impeccable/design.json` sidecar carry the button (three weights
and a large size), the field, the icon button and the tip. Two survey findings
turned out false (the cursor's and the swatches' colour literals, above).

_(This file lost its backlog and C3 section in the C2.1 commit, when an edit
kept the text before its insertion point and dropped everything after it;
restored here from `358fea3`, with what C2 has learned since.)_

## C3 — per-surface critique ✅

Each: `/impeccable critique <surface>` (two isolated assessments + detector,
browser evidence at desktop and narrow widths, both worlds) → surface contract
in `apps/web/.impeccable/surfaces/` → `polish`; `bolder`/`typeset` permitted on
the inspector, rail and record line.

| #   | Surface                                                      | Contract | Known going in                                                                                                 |
| --- | ------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Record panel (Inspector, RecordFields, Provenance, Swatches) | none     | the signature component; segmented items 28×26 (off-rhythm); paints over an open context menu                  |
| 2   | Tool rail + flyouts                                          | none     |                                                                                                                |
| 3   | Record line + zoom cluster                                   | none     | runs under the zoom cluster on a signed-in shared board                                                        |
| 4   | Context menu, search, arrange bar, format bar                | none     | search under the notice layer and 16px from the top; search `outline: none` with no ring; `:focus`-only fields |
| 5   | Comments, mentions, presence                                 | none     |                                                                                                                |
| 6   | BoardLocked, BoardGone, notices (quarantine), toasts, errors | none     | `harden` + `clarify` on copy; the gate's field has no visible label                                            |
| 7   | Selection apparatus                                          | none     | FrameView/TableView divide by zoom (rule 24)                                                                   |
| 8   | Object views (11 types + 8 semantic slips)                   | none     | shape fill-vs-stroke contrast never checked (PRODUCT.md)                                                       |
| 9   | Home, account, share                                         | yes      | re-critique for regressions                                                                                    |
| 10  | Boot splash                                                  | none     | inline styles, own timings                                                                                     |

Closing pass: `/impeccable audit apps/web/src` (a11y, performance, theming in
both worlds, responsive/touch), then `impeccable-finish-reviewer` per surface.

### #1 Record panel — critique and fix pass

`/impeccable critique` (dual-agent, both worlds, 760px and 1280px) scored it
**21/40**, snapshot `apps/web/.impeccable/critique/2026-09-25T00-53-07Z__src-ui-inspector-tsx.md`.
Paint is sound — detector clean on its five files, axe 0 violations, every
text pair ≥ 5.78:1, every control named and ringed. The problems are
behaviour and hierarchy. Owner's call: correctness first, then a head and a
named record band, all five issues.

- **P0 — fixed: continuous controls wrote per event.** The colour picker
  dispatched `UpdateStyle` on every pointer move and the opacity slider on
  every step — one drag, ~20 undo entries, against rules 4 and 14. A style
  being aimed at now lives in the interaction store (`stylePreview`),
  `ObjectView` merges it like a crop or a divider, and one command lands when
  the gesture ends (release, Enter, leaving the control, or closing the
  picker) — on the objects it was previewed on, since the ending click may
  select something else. Escape takes it back. The table's cell colours write
  data rather than style, so their picker settles once at the end without a
  live preview on the cells; noted for #8. Three e2e tests, two of which fail
  with the old per-move write restored.
- **P1 — fixed: the panel was in the way.** Surfaces in the apparatus layer
  stacked in mount order, so the record panel painted over an open context
  menu whenever it rendered later — "Promote to evidence" was clipped out of
  the only place it lives. `AnchoredSurface` takes `layer="menu"` and menus
  sit on `--of-z-menu`. And holding Shift, which means "add to the
  selection", makes the panel step aside — faint, pointer passing through —
  because the next object is usually under it; not while focus is in the
  panel or any editor, where Shift is a capital letter. Two e2e tests, both
  failing with the change removed; the context-menu goldens moved and show
  every item.
- **P1 — fixed: placeholders impersonated data.** The evidence type's
  placeholders are realistic examples, and in muted ink beside real values they
  read as entered — an unsourced slip looked sourced. They now read "e.g. P07",
  in italic, and an empty record field has a dashed edge, the way this world
  already draws absent content, so which evidence is sourced is visible at a
  glance. Scoped to the record panel: an empty comment box is a blank to type
  into, not a missing record. One e2e test, failing without the dashed edge.
- **P1 — fixed: the panel had no head.** The type is a title now (15px/600,
  "Evidence", derived from the id by `scene/type-noun.ts` — a registry-declared
  label would be purer, but a required field on every type is a breaking
  change this did not justify), with the object's own summary beneath; a mixed
  selection reads "2 objects · sticky · shape". Types with a record get
  `record` and `appearance` bands as specimen labels. One e2e test; the
  inspector goldens moved.
- **P2 — fixed: state, words and keyboard.** A fresh object's colour is marked
  and seeds the picker (views declare `defaultColor`; a render test holds each
  declaration to what is drawn, broken once with a wrong one). Labels name one
  thing each: surface / text / outline / label targets, "dash", "vertical".
  Delete is last in DOM order, drawn in the corner; radio rows have a roving
  tabindex and arrow keys, wrapping; options and the slider's hit area are
  30px. Four e2e tests, two failing with the change reverted.
- **Found: a table declares `color` and never paints it** — picking one
  changes nothing (rule 21). What a table's colour should mean is a product
  decision; exempted by name in `default-colour-coverage.test.tsx`, with a
  test that fails once the table paints it. For C3 #8.
- **Contract written:** `apps/web/.impeccable/surfaces/apps-web-src-ui-inspector-tsx.md`
  (thesis, head, bands, words, gestures, keyboard, placement, what it is not,
  and the tests that hold it). Full e2e after the pass: 340/341, the one
  failure the known `comments.spec.ts:901` flake.

### #1 Record panel — re-critique

**21 → 24/40.** Verified by measurement: a 20-move picker drag is one undo, six
opacity steps one undo, the context menu is on top in every sampled point,
Shift lets a click through to the object beneath, the default colour is marked,
every target ≥ 30px, axe 0. The re-run found a P0 the fix pass itself
introduced — arrows in a radio row also nudged the object — fixed in `c8c05d2`
with an e2e test.

Logged as the panel's backlog (the owner asked to move on to the rail):

- P1 the evidence panel (539px, no scroll) runs over the record line and zoom
  cluster; at 760px it covers the zoom cluster and the selection's handles
- P1 Shift does not yield once focus is in the panel (recolour, then extend)
- P1 a connector's colour targets overflow the panel and misname what they
  paint; its default marker is wrong
- P2 the `record` band reads as a label and holds a connector's geometry
- P2 Escape on opacity commits; text/outline defaults unmarked; radios and
  swatches speak their name twice (`aria-description` = name); the dash group
  is announced "line"; weak "on" swatch mark in After Hours; the 760px context
  menu runs 7px off-screen

Inspector P1s from the re-critique — **all three fixed** (owner's call):

- **Connector colour targets** (`475c988`): the connector declared `color` and
  `strokeColor`, both painting one line; it declares `strokeColor` alone, the
  target is called "line" on a type with no surface, the unset line is marked,
  and the B/I/U row is "marks".
- **Shift after a click inside the panel** (`ecdcda8`): busy now means typing.
- **Panel height**: appearance folds away by default on types that carry a
  record. Each `FieldDefinition` now declares a required `meaning` —
  `record` or `shape` — so a connector's route and ends are filed with its
  appearance rather than as a "record". Evidence panel clears the record line;
  one e2e test, plus the connector test asserting no record band.

Inspector P2s — **fixed** (one commit):

- **Spoken once.** Swatches, marks and radio options, plus six controls
  outside the panel, carried an `aria-description` equal to their name. The
  tips guard now reads each element and fails on a tip that is never announced
  OR is announced twice (it was broken both ways and watched fail).
- **The dash row** is announced "dash", the label it is shown under.
- **Escape on opacity** takes the aimed steps back and keeps the panel open.
- **The "on" swatch** carries a 2px accent ring outside the chip.
- **The context menu** is capped at the window, less the 12px margin it is
  placed within, and scrolls instead of running off a short window.
- **The record band** is ink over a rule and counts the fields still blank
  ("3 blank"). `FieldDefinition.essential` is still consumed by nothing; the
  count uses every record field until a type says which ones matter.
- **Not changed, on purpose: the text colour's default is left unmarked.** An
  unset text colour inherits the board ink, which in After Hours is not one of
  the palette tokens, so marking a swatch would claim a choice nobody made.
  The outline default is marked because it is a token.

### #2 Tool rail and flyouts — critique

**21/40**, first run (`.impeccable/critique/2026-09-25T03-05-16Z__src-ui-toolbar-tsx.md`).
P0: no rail button can be pressed from the keyboard (the global keymap claims
Enter and Space). P1: flyouts unreachable by keyboard, undismissable, 16px
targets, and painting over the record panel; the fixed 599px rail runs off
short windows and into the record line. P2: grouping and tool set; weak active
state. Fix order pending the owner's answers.

Rail fix pass — **P0, both P1s and both P2s fixed** (owner's answers: all
of it; options by pressing the armed tool again; bolder = filled ink bed;
regroup only):

- **P0 keyboard** (`8fa01ce`): a control the keyboard focused keeps Space and
  Enter. Focus is tracked by input source, because `:focus-visible` turns on for
  a clicked button as soon as any key goes down, which would have eaten the pan
  hold. The first attempt got this wrong and the e2e caught it.
- **P1 menus** (`4edddb4`):
  - pressing the armed Shape or Table opens its options, and the second press
    no longer cycles the shape
  - the options strip sits in the rail's padding, beside the tool
  - focus moves in when a menu opens; Escape or a press elsewhere closes it and
    returns focus
  - the shape menu takes arrows, Home and End
  - the size grid is one Tab stop of 24px cells, and the readout is in words
- **P1 short windows** (`421c826`):
  - the rail sits in the band above the record line
  - tools step down 50 → 40 → 30 as the window shortens, and the rail scrolls
    only below 494px tall
  - the rail's footprint is one shared constant instead of two stale copies
- **P2 groups** (`087080d`, and `a55b9e9` for the keymap tests that read the tool
  list): the three groups are navigate, make and annotate; Image joins make.
- **P2 armed state** (`d895280`): a filled ink bed, with the contrast pair
  measured off the rule itself.
- **Minors** (`6d50bb3`):
  - `aria-keyshortcuts` on each tool
  - the file input has a name (axe's one finding)
  - rail tips wait the shared dwell for a pointer
- **Kept, on purpose:** the shape menu marks the current kind even when Shape
  is not armed. The rail's own icon already shows the remembered kind, and
  the mark answers "what will Shape make".
- **Backlog:**
  - rail tips lose to the record panel, because the chrome layer sits above the
    rail's and raising the rail would cover apparatus
  - structured types have no entry point on the rail (a product call)
- **Contract:** `apps/web/.impeccable/surfaces/apps-web-src-ui-toolbar-tsx.md`.
  Full e2e: 368/368. `pnpm verify` green.

### After the rail — owner's testing, and the text and navigation rework

The owner chose to merge everything together. They reported bugs, asked for
formatting and lists on every text surface (labels included), and asked for
the record line to become a top navigation bar with bolder text.

- **Bugs fixed** (`35d6c54`):
  - **The table's cell bar tabs overlapped.** This review caused it, through
    the fixed 30px option-button rule; a golden for the cell bar now exists.
  - **A connector label's colour never rendered.** A CSS `fill` outranked the
    SVG attribute.
  - **Typing in a coloured cell wiped its colours.** Found by the code survey.
  - **Floating surfaces measured themselves mid-animation.**
- **Lists and rich labels** (`72bcd46`, ADR 0014):
  - lists live on the newline that ends a paragraph, so no body-text migration
  - connector labels (v3, whole-label marks moved into spans) and frame titles
    (v2) became rich text, with frozen fixtures
  - one editor for all of them
  - the size-specimen exemption from the 12px floor is gone with its control
- **Table cells** (`21d6baa`): rich text through `RichTextField`, with the
  format bar as the cell bar's first row.
- **Navigation bar** (`a1527bf`):
  - the record line runs along the top; the board's name is 15px sans at 600
  - floating surfaces keep clear of furniture at both edges; menus keep clear
    of none
  - a table's row and column controls merged into one control on its right
- **Rail tips** now read over a record panel beside the rail: the rail rises to
  `--of-z-reached` while it is being reached for.

### Tables as a lightweight spreadsheet (ADR 0015)

After more hands-on testing, the owner asked for three things:

- new rows and columns should inherit their neighbours' styles
- each cell should have a top, bottom, left and right line that can be set
  on its own, replacing the confusing single rule colour
- the table as a whole should work more like a spreadsheet, with no formulas

- **Model (v2):**
  - lines live on the grid, sparse, one entry per stretch of line
  - merges are rectangles that keep the text they cover
  - a cell carries only fill and ink
  - the v1 `border` migrates onto the lines it drew, with a frozen fixture
  - the table's `color` is finally painted, as its ground, so its exemption in
    the colour-coverage test is gone
- **Editor:** a spreadsheet with a navigating mode and an editing mode:
  - column letters and row numbers, and drag-select
  - insert, delete, merge and unmerge from a right-click menu or `···`; new
    tracks dress like their neighbour
  - a borders menu with eleven presets and a pen (weight, pattern, colour)
  - the format bar applies to a whole range when there is no caret
  - the apparatus is drawn in screen space through a new `Overlay` editor
    slot (rule 24)
- **Removed:** the end-only +/− shape control, the "rule" colour target, and
  the per-cell field keyed by index. The stale-field bug that key caused
  cannot recur, because only the cell being typed in is a field.
- **Contract:** `.impeccable/surfaces/apps-web-src-views-tableview-tsx.md`.

### C3 #3 · Navigation bar and zoom cluster (critique 24/40)

A dual-agent critique scored the bar and cluster 24/40. It found:

- **P1:** a hidden board name and no tab title.
- **P1:** keyboard and screen-reader defects.
- **P1:** a zoom readout whose tip described a different action from what a
  click did.
- **P2:** the bar's contents and order.
- **P2:** the zoom cluster mixing in its two settings.

The owner chose everything, minors included; the name taking the free width;
a save state in place of the object count; and wheel and snap staying in the
cluster, clarified.

- **Name** (`e0ace8a`): up to 48ch, shown whole in its tip when cut off. The
  tab reads "<name> — OpenFrame". The bar is marked up as `nav` with the name
  as its `h1`. The dev bench panel gives its width first.
- **Keyboard and assistive tech** (`1e263eb`):
  - Focus returns after every inline edit and after the last undo.
  - Focus handed back by the keyboard takes Enter.
  - A new guard requires every tipped control to name itself; it found 13
    across the app.
  - Theme toggle back to 30px; the Source link is a 30px target (the link itself was removed in #89).
- **Zoom readout** (`6d9737d`): an honest tip, 50/100/200% presets while the
  field is open, and a refused zoom says why.
- **Contents** (`96d4d49`):
  - The runtime exposes a save state, and a failed write is no longer
    console-only.
  - "N selected" appears only when something is selected.
  - Source moved to the end.
  - Pressing your name opens an account sheet instead of signing you out.
  - Sign in lost its outline.
- **Zoom cluster** (`48d63bb`): "wheel: zoom", a snap glyph of its own, one
  name per control, and the slider read as a percentage.
- **Minors:**
  - "Ctrl+Z" shortcut formatting
  - "Undo restyle 1 object" in sentence case
  - a crescent moon for After Hours
  - a 1px accent ring on pressed toggles, guarded at 3:1
  - the rail's gutter at every width
  - narrow-window give-way at 640 and 480 with nothing overflowing
  - stale "record line" wording replaced in DESIGN.md and the code comments
- **Contract:** `apps/web/.impeccable/surfaces/apps-web-src-ui-statusbar-tsx.md`.
- **Left for later:** the front door's account chip still signs out on a press
  (C3 #9, Home).

### C3 #4 · Context menu, search, arrange bar, format bar (critique 22/40)

A dual-agent critique scored the four surfaces 22/40. It found:

- **P0:** Escape silently discarded typed text, and could not be undone.
- **P1:** the context menu was not a keyboard menu.
- **P1:** the context menu had no hierarchy: 16 flat rows, and an
  all-disabled menu on empty board.
- **P2:** search had no focus ring, no listbox semantics and lost focus.
- **P2:** the format bar had no size readout and no keyboard reach.

The owner chose everything, minors included; Escape commits; the full
menu restructure; and all three format-bar additions.

- **Escape keeps words** (`ee3bde4`, `e9f2626`): every editor commits on
  Escape. An edit that changed nothing commits nothing. The surface goldens
  had been photographing a note Escape emptied.
- **Context menu, keyboard** (`95677c8`): focus in, arrows, Home/End and
  typeahead; Escape closes only the menu; Shift+F10 hangs it from the
  selection; `aria-disabled`, `aria-keyshortcuts`, one shortcut notation.
- **Context menu, hierarchy** (`d3010a9`): Derive and Promote lead; the
  stacking order becomes "Arrange ›"; Delete stands alone as danger; an
  empty-board menu; 30px rows so it fits under the pointer.
- **Search** (`bcc37ec`): combobox over a listbox, a focus ring, closes on a
  press elsewhere, focus handed back, a content line instead of the typed
  summary, a `type:` hint.
- **Format bar** (`1019a64`): a size readout held to the stylesheet's ladder,
  ends switched off, shortcuts in every tip, Mod+Shift+X and Mod+Shift+>/<,
  Alt+F10 into the bar. One `--of-disabled` opacity across the app.
- **Minors:** the arrange bar's alignments grouped in threes; distribute's
  reason reachable; redundant descriptions removed; one hover wash for
  "about to choose".
- **Owner note, same pass** (`c76e2de`): the record panel said "Frame: Frame".
  Each type now gives a `gist` — its content alone — which the panel and
  search print; the summary keeps its label for MCP and provenance.
- **Contract:** `apps/web/.impeccable/surfaces/apps-web-src-ui-contextmenu-tsx.md`.
- **Left for later:** the arrange bar is first in tab order (the chrome layer
  precedes the navigation bar in the DOM); at 760px it can still sit over the
  record panel; a partly bold selection shows bold off rather than mixed; the
  menu still opens over the record panel (deliberately, per its test); Hide
  says nothing about where hidden objects go.

### C3 #5 · Comments, mentions and presence (critique 21/40)

A dual-agent critique, run in a live two-person room, scored the surface 21/40:

- **P0:** Escape, or a click on another spot or pin, threw a comment or reply
  draft away.
- **P1:** a comment could not be started by keyboard; focus fell to the body
  after every close; the mentions list could not be entered or dismissed; no
  arrival was announced.
- **P1:** nothing said when, how many replies, or brought a listed thread's
  pin into view.
- **P2:** reading a thread put the keyboard in Reply; no way back to the list.
- **P2:** no direction — open pin in the guide hue, a solid accent bell, 22px
  overlapping faces, mention initials at 1.5–3:1, the pin's point 26px below
  its spot.

The owner chose everything, minors included; drafts kept on Escape; relative
time with the exact date in the tip; faces at 24px without overlap.

- **Drafts** (`4685bf4`): kept outside the panel per spot or thread, restored
  with "Draft kept from before.", cleared only by posting; an unposted new
  comment stays as a dashed draft pin.
- **Keyboard and announcements** (`50fa8df`): M on a selection starts a
  comment; focus returns to what had it; Escape anywhere in the panel; the
  mentions list is a sheet; arrivals announced politely.
- **When, how many, where** (`c51ef31`): `Ago` on every remark, row and
  mention; reply counts; list clicks go through focusComment.
- **Reading a thread** (`9bdfce9`): heading focus, "All comments".
- **Marks** (`dd9c8f2`): pin point on its spot, open pin in ink, quiet bell,
  24px faces side by side capped at three plus "+N", initials guarded.
- **Minors** (`504997e`): pin names and counts, no self-mention, dismissal per
  mention, no doubled space, textbox role, hidden avatar initial, clearer
  errors, room chip copy failure, panel at the gutter, inert disabled primary.
- **Contract:** `apps/web/.impeccable/surfaces/apps-web-src-ui-commentpanel-tsx.md`.
- **Left for later:** edit/delete a remark; next/previous thread; the
  "Shared" chip copies rather than opening the chooser; a ghost face seen once
  after a reload; the canvas presence layer is hidden from assistive tech.

### C3 #6 · Blocked and degraded states (critique 20/40)

A dual-agent critique of the password gate, the deleted board, a board this
version cannot read, an object from a newer version, the notice, the toast and
start-up failure scored 20/40 (`2026-09-26T05-30-44Z__src-ui-boardlocked-tsx.md`):

- **P0:** an unreadable board opened as an empty board with every tool and a
  "(newer-schema)" banner. It looked like the work was gone.
- **P1:** the gates were unnamed dialogs over a live board. Tab left them, a
  wrong password dropped focus, the password gate had no way out, and a
  deleted board could only be walked away from.
- **P1:** a start-up failure was one line over the splash artwork, and the
  front door looked for boards forever.
- **P2:** the notice wore the danger colours. The toast borrowed the notice's
  classes and had a 0px close glyph.
- **Minors:** type identifiers shown to people, "object(s)", "room",
  "Read only".

The owner chose everything, minors included; a read-only sheet over the
board; "Keep a copy" beside All boards; a quiet gate-style start-up panel.

- **Read-only sheet** (`9e0e36e`): "Your board is safe", the name and count,
  the reason in words, Download a copy of the stored record, no rail and
  viewer capabilities. The e2e test asserts the stored bytes never change.
- **Gates** (`85398e7`): the shared `Gate` shell is named and described, the
  app behind it is inert and Tab wraps. The password field is never disabled;
  after a wrong password it takes focus back and reads as invalid. All boards
  on every gate.
- **Keep a copy** (`51c45f1`): saves what was on screen as "<title> (copy)"
  under a new id, then opens it.
- **Start-up failure** (`7f3d15f`): `StartFailed` names refused storage and
  offers Reload and All boards. AppErrorBoundary uses it too (`.of-fatal`
  retired), and Home says when it cannot list boards.
- **Notice tiers and toast** (`d55a60d`): the notice is advice on the panel
  stock; the toast is a failure with its own class, a 24px drawn ×, a paused
  clock and an 8px gap. Dismissal hands focus back. Wording fixed.
- **Minors** (`29f1b5e`): "Kanban card, from a newer version of OpenFrame",
  and double-click says why it will not open (`cannotEdit` on the
  description); fallback and render-error words; the read-only title as saved
  and centred; "Read-only"; CSS tidy.
- **Goldens:** the sheet, the deleted gate, the notice with a toast and the
  start-up panel, in both worlds. The password gate moved (All boards).
- **Contract:** `apps/web/.impeccable/surfaces/apps-web-src-ui-boardlocked-tsx.md`.
- **Left for later:** the record panel stays hidden for a placeholder, which
  has nothing to edit; the start-up panel's scrim covers an empty page; images
  in a kept copy whose bytes only the deleted room held will not load.

### C3 #7 · The selection apparatus (critique 24/40)

A dual-agent critique scored the selection apparatus 24/40
(`2026-09-26T07-26-00Z__src-canvas-selectionoverlay-tsx.md`). Its engineering
was sound: every overlay was the same size at 25% and at 1600%. Its problems:

- **P1:** the box stayed behind during a move and during a line's reshape.
- **P1:** a frame's edge divided by the zoom and painted 16px at 1600% (rule
  24).
- **P1:** no keyboard path. Objects were never focusable, resize, rotate and
  lock were pointer-only, the lock key was never bound, and selection changed
  in silence.
- **P2:** press targets of 24, 22, 14, 12, 10 and 9px; a small shape at 25%
  resized instead of moving.
- **P2:** the accent below 3:1 on black and white fills and against every
  coloured connector.
- **Minors:** a bare group box, an inert padlock, a box around a lone line,
  upright cursors on a turned object, Escape that deselected mid-drag and
  left crop and selection at once, members indistinguishable from bystanders,
  your own line lighter than a peer's, no hover tier, no size or angle
  readout, chrome text swept into a selection.

The owner chose everything, minors included:

- keys on the board, with announcements;
- keep the look and fix contrast with a halo;
- corners only below about 48px.

- **The box follows a move** (`b41dda5`). A lone line is selected by its ends.
- **The frame's edge** (`583eedb`) is laid out at zoom× and painted at 1/zoom.
- **Targets** (`6b1cd88`):
  - every grip presses as 24px, border-aware;
  - crop brackets and targets sit outside the picture;
  - table dividers are 24px;
  - compact selections below 48px.
- **The halo** (`1c30c81`): a page-coloured halo under the selection, guides
  and legs, measured on every slip and ink in both worlds.
- **The keyboard** (`7fcd905`):
  - Tab walks objects in reading order;
  - Alt+arrows resize, period and comma rotate, Mod+Shift+L locks;
  - an announcer and a focus ring.
- **Escape** (`2d4850d`): a drag, then a crop, then the selection.
- **What a selection says** (`b5cbea7`): an unlocking padlock, "Group of N",
  member marks, a size or angle readout.
- **Under the pointer** (`2ebc9b2`):
  - turning cursors and a hover outline;
  - a 2px line;
  - grip hover and press states and a "move" cursor on route controls;
  - unselectable chrome.
- **Contract:**
  `apps/web/.impeccable/surfaces/apps-web-src-canvas-selectionoverlay-tsx.md`.
- **Left for later:**
  - connect points and attached ends on a rotated object's turned edges
    (core connector geometry);
  - distances on guides;
  - crop in the record panel;
  - the record panel over a line's target;
  - axe's `meta-viewport` and `region` (outside this surface).

### C3 #8 · The object views (critique 24/40)

A dual-agent critique scored the object views 24/40
(`2026-09-26T21-39-39Z__src-views-stickyview-tsx.md`): a real slip system
beside a generic kit, carried by colour alone. The paper and ink system was
sound (every ink on every paper, both worlds). Its problems:

- **P1:** a type was only a colour. Gray meant five things, a promoted note
  looked unchanged, and a journey stage could not be made at all.
- **P1:** shape labels hugged the top-left corner against DESIGN.md's
  "centred".
- **P1:** connector labels were counter-scaled, so they were the largest text
  at 25% and the smallest at 200%, and a plate kept the board's ink (1:1 on
  black).
- **P2:** edges that vanished: white shapes by day, black lines at night, the
  frame edge at 1.45:1, the table grid at 1.2:1.
- **P2:** After Hours: violet and blue slips at 1.2:1 on the page; white paper
  at 18:1.
- **Accessibility:** names repeated whole bodies; a cleared alt vanished;
  table cells had no rows (axe critical); code scrolled unfocusably (axe
  serious).
- **Minors:** four radii, only slips at slip height, "plain" on every code
  block, a one-line text box, a faded placeholder, a truncated participant,
  derived slips landing on other clusters, and editors that reflowed text.

The owner chose everything, minors included; a type word in the record line;
labels that scale with the board within limits; and a plain kit made
consistent rather than restyled.

- **Type words** (`3482709`): the record band always names the type;
  experiment pink, journey stage brown, a filled frame white; "Promote to" as
  one submenu with journey stage in it.
- **Shape labels** (`447008f`) centre by default, and the panel says so.
- **Connector labels** (`7ed5681`) scale ×0.5–×2, take a plate's ink, and a
  page halo.
- **Edges** (`c142c2d`): `lineOf` and `--of-line-*`, control-border frame
  edges, `--of-edge-inner`; PRODUCT.md's fill-against-stroke gap closed.
- **After Hours** (`58f3341`): the slip ring and dimmed white paper.
- **Reading** (`dbcae20`): names without bodies, an alt that is never empty,
  table rows, clipped code.
- **Minors** (`e6dd43a`): one corner and slip height for the plain kit, the
  code label only when set, a muted placeholder, a two-line text box,
  participant first, `placeDerived`, and editors that keep the object's type.
- **Contract:** `apps/web/.impeccable/surfaces/apps-web-src-views-stickyview-tsx.md`.
- **Declined, with reasons:** default stroke weight at 200% (a stroke is
  content and scales with the board, rule 24); a later frame painting over
  earlier objects (stacking order, which Arrange controls).
- **Left for later:**
  - relations drawn on the board (provenance is still panel-only);
  - a fixed type mark that colour cannot override;
  - the connector editor still scales with the world while the label is
    clamped.

### C3 #9 · The front door, the account and sharing (critique 21/40)

A dual-agent re-critique of Home, the account sheet and the share sheet
scored 21/40 (`2026-09-26T23-19-32Z__src-ui-home-tsx.md`). Both surfaces
already had contracts from 2026-09-19; the ledger's form still honoured its
contract, but the edges had drifted and sharing no longer matched its own.

- **P0:** sharing a local board moved it on the press, then left the old
  page editable while it said "Saved". A note written there was gone on
  reload.
- **P1:** the sheets and the row's modes trapped the keyboard. No sheet
  took focus, three ignored Escape, and focus fell to the page after every
  row action.
- **P1:** the front door's account chip signed you out on one press.
- **P1:** at 390px the home page scrolled sideways and the board's bar ran
  off both edges. `user-scalable=no` disabled zoom everywhere.
- **P1:** the share contract described a path only legacy boards reached.
  The owner's everyday chip silently copied the edit link.
- **P2:** control edges at 1.1–1.8:1, and a 23px target.
- **Minors:** "shared" on every row, wrapping times, the empty state, the
  lost "a link needs nothing" line, workspace naming and invite copy,
  native validation, the sign-up hint as a placeholder, tips over open
  sheets, and sheets animating from the wrong edge.

The owner chose everything, minors included:

- confirm, then land on the shared board;
- the owner's chip opens both links with the password beside them;
- at phone width, the account shrinks to its face and Source moves into its
  sheet.

- **Share asks first** (`a7b7895`): a gate with the board inert, then land
  on the shared board with the links open. The rule-7 test runs against a
  real room.
- **The owner's chip** (`559e4df`): both links, the password beside them
  (moved out of the row), and a named copy for everybody else.
- **Sheets** (`5c7e239`): `useDismiss` and `useFocusOnOpen` for every sheet;
  Keep takes the keyboard; the sign-in form does its own validation, tied
  to its fields.
- **The home chip** (`5074551`) opens the account sheet, borderless.
- **Phone width** (`4ac5d06`): zoom allowed, the header wraps, the page
  clips, confirmations wrap, and below 480px the bar shows the account's
  face with Source in the sheets.
- **Edges** (`45a17a5`): every drawn boundary clears 3:1, guarded in
  `design-tokens.test`.
- **Minors** (`3732116`).
- **Contracts:** the share contract is rewritten (v2); the Home contract has
  a revision section; DESIGN.md gains a Sheets section.
- **Left for later:** whether a board has a password (it needs the rooms
  worker to say); a world toggle on the front door; a focused row action's
  tip covering the row above.

### C3 #10 · The boot splash (critique 16/32)

Snapshot `apps/web/.impeccable/critique/2026-09-27T15-34-27Z__src-app-splash-ts.md`,
dual-agent. The score is out of 32: heuristics 6 and 10 do not apply to a
two-second sheet with nothing to recall or document. The detector's three hits
in `index.html` were false positives (the pre-load opacity, and two literals
pinned to tokens by `brand-splash.test.ts`), and axe found no violations.

- **P1:** the splash could stay up forever. `startCollaboration` was awaited
  outside the try, and a room that refused the socket left it over an inert,
  empty root, still saying "Opening your board".
- **P1:** the two-second hold was paid on every page load, including every
  board opened from the front door: about 1.2s of pure waiting each time, and
  a dark neon flash between two pale pages in the Notebook.
- **P2:** "Opening your board" on the front door, and "your" on somebody
  else's board.
- **P2:** the error boundary's panel and the front door's failure waited out
  the hold. Focus landed on nothing, and an alert rendered into the inert root
  was never announced.
- **Minors:** a 999px capsule; fades off the motion scale; `theme-color` stuck
  at violet in both worlds; a comment naming a function that no longer
  existed.

The owner chose everything, minors included; the artwork once per session and
then a quiet sheet; and a route-aware label with no capsule, plus a watchdog.

- **Never hangs** (`bed1598`): one try around every start-up await, and an
  inline watchdog that says "Still opening" and offers Reload at 12s.
- **Once per session** (`c90c30d`): later loads get a quiet sheet in the
  world's page colour, gone as soon as the page is ready.
- **Browser chrome** (`b8b2d75`): `theme-color` follows the world.
- **The label** (`2c684ea`): says what is opening, has the control radius,
  and sits under the picture in portrait.
- **Failures not held** (`705a1ee`): StartFailed and the front door take the
  splash away first.
- **Motion** (`d0ffd2c`): `--of-settle` on `--of-ease`, pinned.
- **Quiet and stalled** (`591d949`): found while photographing it. A quiet
  sheet whose watchdog fired brought the artwork back; the picture is now
  always hidden there.
- **Contract:** `apps-web-src-app-splash-ts.md` (new). DESIGN.md's "The
  brand" is rewritten for once per session, the quiet sheet and the
  watchdog.
- **Left for later:** at 844×390 the label brushes the bottom of the
  wordmark's reflection.
- **For the QA track:** under a loaded run, a key pressed the moment the rail
  is visible can arrive before the keyboard listener's effect has attached.
  `notices.spec.ts:90` and `rail-keyboard.spec.ts:147` each failed once in 80
  loaded repeats. Main shows the same race: 1 failure in 160, on the same two
  files. Specs should wait for the board to be ready, not merely drawn.

### Cross-cutting audit · `apps/web/src` (14/20 → 19/20)

Report `docs/reviews/audit-2026-09-27.md` (`fd36c88`), taken from three
isolated agents on the running app in both worlds: accessibility, performance
and theming, and responsive, touch and integrity. The owner chose to fix
everything: real two-finger pinch and pan, a bottom sheet for the record panel
on narrow screens, and the bundle split in this pass.

**P1**

- **Drag** (`1115ea6`): an object subscribes to the drag offset only while it
  is being dragged. 576 renders per 10 moves → 18.
- **Focus after an edit** (`3bfacc7`): the board takes the keyboard back when
  an edit ends, and takes it on a click.
- **Signed out on a phone** (`a88c5fa`): "Sign in" stays a word, and Source
  stays reachable.
- **Rail disclosures** (`76875cb`): the options strip is a 24px target
  (`--of-hit-min`).
- **Record panel** (`06be69a`): height-capped and scrolling, and a sheet along
  the bottom below 560px or wherever it cannot fit beside the selection.
- **Touch** (`03e4774`, `ce82b3c`): two fingers pinch and pan about their
  midpoint; a second finger abandons a one-finger gesture; `pointercancel`,
  `lostpointercapture` and blur revert as Escape does.

**P2**

- **Focus when the record panel goes** (`4759c33`): back to the board.
- **Mention combobox** (`cab4b37`): `aria-controls` and `aria-expanded` only
  while the list exists, and an announced count.
- **A shared board's bar** (`4b72f76`) fits every width.
- **Comments on a phone** (`7729cf1`): a `dvh` bottom sheet, clear of the rail
  and Find.
- **Coarse targets** (`a5b9f6e`): 40px under a finger; the workspace tabs are
  a target.
- **Zoom** (`11104b7`): only views that declare `usesZoom` receive it. 640
  renders per 10 wheel steps → 0.
- **Hover** (`58d9e28`): paint order is cached per document (`bench:cull`
  board-10000 5.69ms → 0.17ms; board-mixed-10000 4.52ms → 2.57ms), and the
  store is written only on change.
- **Bundle** (`83777a3`): Supabase and the collaboration code load when used.
  Entry chunk 1,002,571 B → 516,425 B (288,150 → 154,937 gzipped).
- **Text size** (`ecf41bf`): the interface ramp is in `rem`; the board's is
  redefined in px on `.of-world`. No golden moved.

**P3**

- **Overlays** (`9f060e2`): the apparatus is one memoised, prop-less
  component. 240 overlay renders per 60-move pan → 120.
- **Semantics** (`8bd8af6`, `5c65b20`, `f4b6242`): the password gate is a
  dialog holding a form; the board is the `main` landmark, after the
  navigation and its h1; an empty table header is named "Column A"….
- **Pressed toggle** (`e9fcec7`): a 2px bar along its foot, not a ring that
  reads as focus.
- **Images** (`7a46f10`): `decoding="async"`.
- **Front door at 390** (`1814dbe`): the name has the row and may take two
  lines, and the time never breaks.
- **Rail** (`274c393`): a rail that scrolls fades at the end with more. Found
  while testing it: under a finger the rail overran its box between 493 and
  603px tall — a regression from `a5b9f6e` — and it now scrolls from 603.
- **Stylesheet drift** (`c46e3bf`, `064827e`, `6c5d158`, `f7bead1`): three
  dead classes gone; every face and weight a token, with the board sharing the
  interface's serif and mono; spaces above the scale on the rule; each
  selector argued in one place, motion aside. `stylesheet-drift.test.ts`
  guards all four.

**Not done, and why**

- **The pan ground** (step 13) was moved to a composited layer and
  **reverted**: in headless software raster it measured about 25% worse in
  raster and wall time. It needs a GPU measurement before another attempt.
- **A forced layout per drag or wheel event** did not reproduce: CDP
  LayoutCount rose by 1 over 60 moves.
- **The After Hours frame fill** was a design question, not a fix. The owner
  chose **night paper**, and it has since landed (see below).

**Found on the way.**

- **The load race** from C3 #10 (a key pressed before the keyboard listener
  attached). It was first patched in two specs (`5324542`), and then the full
  run found it in a third, `board-unreadable`. The root cause is in the app
  (`a4a3c94`): the listener was attached in a passive effect, after paint, so
  a person pressing S the moment a board appeared lost the key too. It is now
  a layout effect. `keys-at-load.spec.ts` makes the race deterministic; it
  failed 3 of 3 before the change, and the three racy files then passed 132 of
  132 at `--repeat-each=6`.
- **Splash timing under load.** Under three loaded workers the splash spec's
  millisecond budgets can miss; alone, all 14 pass.

**Verification.** `pnpm verify` gated every commit. The full e2e run gave
738 passed and 1 failed (the load race above, since fixed at its root); the
40 visual goldens hold, and the rooms suite passes 28 of 28.

**Re-score** — the same rubric, re-scored by me against the fixes rather than
by a fresh independent audit:

| #   | Dimension                | Before    | After     | What holds it back                               |
| --- | ------------------------ | --------- | --------- | ------------------------------------------------ |
| 1   | Accessibility            | 3         | 4         | Untested with a real screen reader               |
| 2   | Performance              | 2         | 3         | The pan ground still repaints (step 13 reverted) |
| 3   | Responsive design        | 2         | 4         | Untested on real devices and WebKit              |
| 4   | Theming                  | 4         | 4         | —                                                |
| 5   | Implementation integrity | 3         | 4         | —                                                |
|     | **Total**                | **14/20** | **19/20** |                                                  |

**Night paper** (the owner's answer to the frame-fill question). A frame nobody
has coloured is laid on the world's paper, `--of-frame-paper`: `--of-s-white`
by day, so the Notebook is unchanged, and the panel stock `#231645` After
Hours in place of the lit `#d6d9e2`. A chosen white still paints white. The
frame no longer declares `defaultColor`, so the record panel marks no swatch
for an uncoloured frame; marking `white` would have marked a colour that,
pressed at night, changes the frame. Guarded by `design-tokens.test`:

- the paper is white by day and the panel at night;
- it is never brighter than the ink or white paper;
- the control-border edge reaches 3:1 on it.

`default-colour-coverage` and `typed-notes` hold the view to the same;
`frame-paper.spec.ts` fails on the previous code in exactly its two After
Hours cases. Two goldens (`*-frame`) are new, and none of the other 40 moved.

### The leftovers (2026-10-01)

Every "left for later" above was checked against the code. Nine had since been
fixed, two could not be settled by reading, and seventeen were still open. The
owner chose which to do, in ten PRs. The first is the small fixes, each with an
e2e test seen failing on the code before it:

- **Mixed marks.** A partly bold selection shows Bold as `aria-pressed="mixed"`
  (the pressed foot bar without its wash) instead of off. Core gains
  `markTouches` beside `markCovers`.
- **Start-up failure on the page.** `of-gone--alone`: no scrim dimming an empty
  page into grey.
- **Connector label editor** drawn at `labelScale`, like the label it edits.
  At 5% zoom it was a tenth of the label's size.
- **Front-door row tips** sit beside their control, not over the row above.
- **Splash, held sideways.** The artwork is cropped from the sky, so the
  reflection clears the label.
- **The two unclear items, measured.**
  - **The record panel over a line's notes.** It now keeps clear of whatever a
    selection's ends attach to (`endpointsOf`).
  - **The arrange bar over the panel in a short window.** Placement slides along
    its side to clear an obstacle, and the bar re-reads the panel when a surface
    lands (`CHROME_MOVED`). Both changes were needed.
  - At exactly 760px wide there is no room: 280px between the rail and the panel
    for a 286px bar. That case is recorded, not fixed.

**A kept copy keeps its pictures.** A deleted room refuses its pictures along
with everything else, and the board fetches only what is on screen, so a copy
kept of a board deleted under somebody had a hole wherever nobody had scrolled.
The owner chose to fetch quietly on open: a shared board now holds every picture
in this browser in the background (`holdAssets`), one at a time, rescanning only
when objects appear or disappear. Holding never mints an object URL. The copy's
pictures are then re-pointed at the bytes held here (`idb:`), so sharing the copy
later publishes them. The e2e places a picture far off screen, deletes the
board, keeps a copy and zooms to it; without the holding it does not load.

**A world toggle on the front door.** The world was chosen only on a board, so
the front door was always the Notebook. The bar's toggle is now one component
(`ThemeToggle`) used in both places, last in the front door's head. The e2e
chooses After Hours at the door and opens a board in it, and checks the toggle
clears the account at 1280 and 390px. The two front-door goldens gained the
button and nothing else.

**Comments: your own are yours to change, and threads can be walked.** A remark
was final once posted, so a typo stayed and a comment on the wrong element
could only be resolved. Now:

- **Edit and Delete.** Your own remarks offer both, in place, under the words.
  An edited remark says "edited". Delete asks first, in place.
- **A thread somebody else has replied to can be edited but not deleted.**
  Deleting it would take their words with it. The control stays reachable and
  says why, rather than vanishing on one thread and not the next.
- **Previous and Next** walk the open threads in the list's order, bringing each
  pin into view. "All comments" became a back arrow, because as three words it
  pushed Close off the 300px panel.

The server side is a migration: `edit_comment` and `delete_comment`, both the
author's alone, and `edited_at` kept apart from `updated_at`, which resolving
also bumps. Every test was seen failing first. Breaking ownership, the refusal
and the walk's ends each failed its test.

**Distances on guides.** A guide said that two things lined up and nothing
about how far apart they were, so a column was spaced by eye. Each guide now
carries the empty stretch to the nearest lined-up neighbour on either side,
said once however many stops line up. The overlay labels it at its middle, in
board units, over the line (page on guide magenta, measured at 4.5:1 in both
worlds). Five unit tests and an e2e were seen failing first. The e2e's
mid-drag number is the gap the drop leaves.

**Measuring, after trying 4f (owner, 10-02).** Two gaps. With the grid on, the
number on a guide ran ahead of the element: it was measured from the pointer
while the element moved in steps of ten. It is now measured from where the
selection lands (`guidesAround`), and the e2e that drags seven pixels past a grid
line failed on 187 against a drawn 190. And there was no way to measure on
purpose. Holding Alt now does what a design tool does: the selection, as one
box, against what the pointer is over (distances, and dashed lines where edges
or centres match exactly); with nothing else pointed at, the gaps between the
selected things. The record panel steps aside while Alt is held, as it does for
Shift, because it was over the very neighbour being measured to. Alt+arrow still
resizes. Twelve unit tests and five e2e; removing the overlay failed three of
them, and removing the blur handler failed the one that lets go in another
window.

**Measuring, second pass (owner, 10-02).** Three more. Cmd/Ctrl mid-drag took the
guides away with the snapping: it now stops the help and not the information,
so a guide and its gap still show where the selection lands exactly in line by
hand. Nudging said nothing: each arrow press now shows the distance to the
nearest neighbour in line on each side, and a dashed line the moment an edge or
centre lines up, until the pointer moves, another key goes down, or 1.5s pass.
And Alt with an arrow resized, which made nudging while measuring change the
size: keyboard resize is Cmd/Ctrl with an arrow now, and Alt with an arrow moves.
Each was seen failing first: the drag-delta unit test, two nudge e2e, the keymap
tests and an e2e that Alt+arrow moves without resizing.

**Crop in the record panel.** Double-clicking the picture was the only way into
cropping, which nothing on screen said and no keyboard could do. The record
panel now offers Crop, a pressed-or-not control that enters and leaves the mode.
It is offered for any type with a crop window (`cropWindowOf`), the same
question the double-click asks, so no type is named. The e2e reaches it by
keyboard and was seen failing first.

**Password state on the front door.** A board with a password said nothing
about it on the front door, so the first anybody learned of it was the gate.
That included its owner, who had set it and forgotten. The rooms worker gains
`POST /room/:id/protection`. It answers `{ password }` to either link or the
owner's key, sent in the body, and a stranger gets the 403 a wrong key gets,
learning nothing. Each shared row asks with the key it holds and adds
"· password" to its tag. When the room cannot be asked, the row says nothing:
"open" would be the worse mistake. Tested at four levels, each seen failing
first:

- the decision and the route, in Node;
- the web client, against a fake network;
- the tag, against a stubbed room;
- a real Durable Object: set, read by all three keys, refused to a stranger,
  cleared.

Measuring on a diagonal (owner's note, 2026-10-02): two things apart on both
axes were measured from each one's middle, so the two lines stood out as
spokes that met nowhere. They are now one L from the selection's near corner
to the target's, each leg still exactly its gap. The unit tests and an e2e
checking that the legs meet on the edges were seen failing first.
The same went for neighbours on a diagonal inside a multiple selection with
nothing pointed at: they were measured midway between their middles, two short
lines crossing in empty space. They get the same L now. A test seen failing
first holds that a thing and what it holds still show no gap between them.
On the preview that was still not right: the across and down passes pick
their neighbours separately, so a pair found by only one of them got one leg
of its L, hanging from empty space. Every pair found by either pass is now
drawn whole (the owner's choice, over measuring only what is in line). The
cost is more lines on a scattered selection.

**Connect points on a turned object.** The connector type has always measured
from a turned object's own edges, but the overlay drew the four points on the
upright box around it. So on a turned note they floated off the edges, and a
line started from one left from somewhere else. `connectPointAt` now takes the
rotation and turns each point about the centre, from the object's own frame.
The unit test and the e2e were seen failing first; at 45° the old points sat at
0°.

**A line to a side that faces away** (owner's note on the 4i preview). Joined
to a turned rectangle, a curved line ran straight through it, past it and back
into its far edge. Each end leaves straight out of its edge, so with the
attached side facing away the curve's four points fell on one line; the
squared route went through too, which nobody had noticed because only the run
leaving the start was ever checked. Both now go round the nearer side of that
shape and come into the edge from outside (the owner's choice, over switching
to whichever side faces the other end). The route tests and an e2e walking the
drawn path were seen failing first.

**Relations on the board.** Provenance was panel-only: "stands on" was a list
of names with nothing pointing at where those things sit. A selected object's
relations are now drawn, and nothing else's (ADR 0011 addendum): a dashed,
muted line edge to edge, with an arrowhead at the end it points to and the
predicate at the middle. They are hidden mid-gesture and gone with the
selection. The record panel now keeps clear of the related objects too; before,
it opened over the lines and the evidence. The unit tests and the e2e were seen
failing first, and the e2e fails both without the overlay and without the
panel's clearance.

Every leftover the owner chose is now done.

Closed since (2026-10-03), in the order they were chosen:

- board clarity: `171cbb2` says where hidden objects went and gives them back,
  `5bf2cfb` follows up; `8d8917e` says who is editing what, for assistive tech;
  `0921dbe` gives a newer version's placeholder a record panel;
- a kept copy keeps its images: `843826d`;
- a world toggle on the front door: `ab7beaa` (`d21b42a` later fixed its e2e);
- editing and deleting a comment, and next/previous thread: `3b9120e`, with
  `83881ca` locking a thread before deleting it;
- distances on alignment guides: `b865c98`;
- crop in the record panel: `4d61753`;
- password state on the front door: `78e250f`;
- connect points on a turned object's edges: `4f9f5da`;
- relations drawn on the board: `6105633`.

Not chosen: structured types on the rail, and a fixed type mark.

## Facilitation A: reactions on notes (2026-10-03)

The first of the owner's five facilitation features. Anyone with an edit link
can leave 👍 ❤️ 🎉 💡 🔥 👀 ❓ ✅ on a sticky, a typed slip or an image, from a
bar beside the selection or from the context menu, and take it back by pressing
the chip. Each reaction is its own object per person, so two people reacting at
once are both counted (the rooms suite holds this); deleting a note takes its
reactions with it and undo brings them back (seen failing with the cascade
removed). Found on the way: a double-click on a chip opened the note beneath
for typing, because the board hit-tested the point; a press on a chrome button
now ends the double-click there, seen failing first.

The owner, trying it on the preview: the bar was drawn under the record panel,
and the eight should not be the only choice. The bar mounted empty while it
learned who was reacting and was placed at that size — nothing — and a
floating surface only measured itself when it re-rendered, not when its
contents changed; it now watches its own size, which every anchored surface
gets. And the bar's last button, or "More…" in the context menu's React
submenu, opens the whole Unicode emoji library: searched by name, walked with
the arrows, loaded only when first opened. An emoji from it is stored as its
code points, and one also on the bar is the bar's reaction.

After #60, from the owner on Windows: the library's classic scrollbar cut off
its last column (which then scrolled sideways), the wheel did nothing over it
because the board claimed every wheel event, and the chip's tip carried an
instruction ("Press to take yours back") nobody needs. The columns now share
the width beside the scrollbar; a wheel over anything in the chrome that can
still scroll scrolls it; and the tip is who reacted, nothing more.

And measuring from a turned object started in empty space: the measuring works
on boxes, and a turned object's box is the upright one around it. Each end of a
line is now pulled onto the outline it measures from — where that row or
column actually crosses the turned shape — so the line touches it and the
number is what is drawn. Upright objects are unchanged.

## Copy pass (2026-10-04)

The owner's rule: we do not write superfluous instructions or copy — and,
equally, necessary instructions stay. An inventory of every string the
interface can show (about 120) was cut to fact: "Press to take yours back",
"Click to copy the edit link", "Try again in a moment", reassurance after
failures, intros repeating their headings, and a canvas description written as
a paragraph went; the instructions that are the only way to learn something
(Cmd/Ctrl overriding snap, double-click to fit a column, @ to mention, copying
by hand when the clipboard refuses, the search syntax, what each share link
gives) stayed. `app/copy-rule.test.ts` reads every interface string and fails
on coaching outside its listed exceptions — seen failing on the old copy.

## The navigation bar, given a hierarchy (2026-10-07)

Critique 23/40 (`apps/web/.impeccable/critique/2026-10-07T01-33-59Z__src-ui-statusbar-tsx.md`):
eleven things on one row in four box styles, nothing grouped, the owner's face
twice, a "Shared" chip that was both a status and the share button, two bells
for one question, two session icons, and a bar that ran out of room at 560,
640, 680 and 820px in turn as controls joined it. The owner chose every
recommended direction:

- **Undo and redo** moved to the zoom cluster; below 480px the wheel's word
  goes so the cluster keeps its gutter.
- **A board menu** beside the name (Rename, Version history…); the **theme** to
  the account and sign-in sheets as Notebook / After Hours.
- **One safety readout** ("Saved · Live", "Offline · saved here", "Not saved");
  **Share** a plain verb; **faces** other people's only.
- **One Inbox** for mentions and agent changes; **one Session pill** for the
  timer and the music, Alt+T to open it.
- **Three zones** (`role="group"`), and the breakpoints replaced by a measured
  squeeze that gives up words for icons, in order, only as far as it has to.
  The name's floor moved onto its heading — it was overlapping the control
  beside it below about 940px.
- **No link to the source** anywhere; the owner holds the copyright.

Rule 23 along the way: the first version of the fullest-bar test measured only
controls inside zones, so on the old bar — which had none — it measured
nothing and passed; it counts every control now. And `scrollWidth` read every
hidden tip's box as overflow, so the first squeeze gave up everything at
1440px; it reads where each zone's contents end instead.

## The newer surfaces, critiqued together (2026-10-07)

Ten surfaces built during the facilitation programme had no critique or
contract. Each was captured in both worlds at 1280 and 390 and reviewed by two
isolated agents (design; detector, axe, measurements and a keyboard walk).
Snapshots are in `apps/web/.impeccable/critique/2026-10-07T14-44-*`.

| Surface                     | Score                | P1  |
| --------------------------- | -------------------- | --- |
| Agent changes in the Inbox  | 21/40                | 3   |
| Board overview              | 22/36 (recovery n/a) | 2   |
| Version history and preview | 25/40                | 2   |
| AI cluster review           | 26/40                | 2   |
| Dot voting                  | 26/40                | 3   |
| Poll card                   | 26/40                | 2   |
| People sheet                | 26/40                | 1   |
| Session timer               | 26/40                | 1   |
| Music and the listen prompt | 27/40                | 0   |
| Reactions                   | 30/40                | 2   |

Two patterns ran through nearly all of them. Focus fell to the page whenever
the pressed control unmounted, and open sheets let Tab walk out while staying
open. At phone width none of the surfaces had been designed. The owner chose
to fix the cross-cutting faults first (keyboard, focus, announcements, an agent
frame that could not be reverted, "object(s)" in agent labels), then docking
every surface to the edges below 520px, then the design fixes. Those design
fixes: real dots on notes, results that open for everyone when a round ends,
a poll only its asker closes, and cluster copies that say they are copies.

### The fix passes (PR A #90, PR B #91, PR C)

**PR A (keyboard, focus, announcements)** and **PR B (phone width)** are
merged. PR B also measured the tool rail as furniture rather
than a stale 100px constant, put the docked record panel along the bottom as
furniture too, and gave the board menu and the history sheet the paper every
other surface has.

**PR C** took the design list in order:

- **Dot voting:** dots, not a badge — up to five on the note's edge, then a
  number. Putting down the last vote lets go of the tool. Ending a round
  opens the ranked results for everybody, with places and a wash for each
  share. Reveal and Clear ask first.
- **Poll:** it records who asked it (poll v2, migrated). Only the asker
  closes it, and the record panel's Closed checkbox is gone. An answered
  option is fixed. A closed poll looks closed, and your answer has a tick.
  Booleans read as a box and then their whole label.
- **Cluster:** it says that it adds copies and the originals stay. Signed
  out, it offers Sign in. The first Escape in a field only leaves the field,
  and the record panel steps aside.
- **History:** a restore says the replaced board is kept. Deleting a name
  takes two presses.
- **Agent changes:** Show selects and frames what a change touched, and a
  partial revert stays said on its row.
- **Timer:** paused reads as paused, and Reset has an Undo reset in the
  sheet.
- **People:** following somebody is said along the top, with Stop.
- **Overview:** it opens from both menus. A click on a frame visits it, and
  the summary counts in words.
- **Reactions:** the library keeps off the record panel, and chips are 24px
  targets.

**The motion pass** carried "entries are set down on a page" onto the board
while people work on it. A dot or reaction placed now is inked in. The ones
already there when a note is drawn stay still, because the view marks
`data-fresh` only for marks that arrive after it mounted.

- **Results:** when a round ends or is revealed, the ranked results settle a
  row at a time, like the ledger, and each wash is drawn out once its row has
  landed.
- **Bars:** poll and result bars are full width and scaled to their share, so
  an arriving answer slides them along without re-laying the card.
- **Entrances:** everything hanging from the top of the board drops out of
  that edge. Menus only fade, because they are opened dozens of times a
  session.
- **Keyframes:** these now move with `translate` and `scale`, so they add to
  an element's own transform. Written with `transform`, they would have slid
  the centred overview in from the side.
- **The guard:** `motion.test.ts` now covers transitions as well as
  keyframes. It was seen failing first, on two real gaps: the record panel's
  turning chevron and the exit's travelling arrow, which both moved under
  reduced motion.
