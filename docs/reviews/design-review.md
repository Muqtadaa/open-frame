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

### Remaining
