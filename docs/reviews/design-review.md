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

### Remaining
