# Design review — surfaces and design language

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

## C2 — extract the system (in progress)

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

## C3 — per-surface critique (in progress)

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
  - Theme toggle back to 30px; the Source link is a 30px target.
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

