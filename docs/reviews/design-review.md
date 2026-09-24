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

Ordered by severity.

1. **`.of-button` has no rule.** `.of-button`, `--primary` and `--ghost` are used
   12 times (NoticeBanner "Dismiss", WorkspaceBar, BoardGone, BoardLocked,
   CommentPanel, CodeView, TableView) and render as browser defaults. Build ONE
   button primitive and fold the per-surface ones into it (`.of-zoom__button`,
   `.of-status__action`, `.of-inspector__action`, `.of-format-bar__button`,
   `.of-arrange__button`, `.of-home__row-action`, …).
2. **Scales that exist only on paper** — make them tokens, then migrate:
   - type ramp: 114 of 122 font sizes are raw px
   - radius: 17 distinct values against one `--of-radius` (frontmatter has
     `slip/apparatus/panel/control/surface/round`)
   - spacing below 10px: 11 of 220 declarations use a token
   - z-index: raw 1–100; `.of-search` (8) sits below `.of-overlay` (10) — verify
   - motion: tool-tip 110ms and the 600ms copy flash bypass `--of-quick`
3. **Duplicates.** `.of-account` ≡ `.of-share` (sheet shells), `.of-notice` ≈
   `.of-toast`. Floating sheets split between 10px (`.of-surface`) and 6px.
4. **Icons.** Stray inline SVGs in WorkspaceBar (1.8 stroke), Swatches (3–3.2),
   ColorPicker, PresenceLayer (1.2); typed glyphs `−`, `A−`, `×` where DESIGN.md
   says icons are drawn. Fold into `ui/icons.tsx` at 1.6.
5. **Tooltips.** ~44 native `title=` tips a keyboard cannot summon, against
   DESIGN.md's own rule. Extract the rail's focusable tip; share one `isMac`
   modifier helper (copied into ContextMenu, StatusBar, ZoomControl).
6. **Colour leaks.** `interaction/tool-cursor.ts:178` hard-codes ink/halo, so the
   cursor ignores After Hours; `controls/Swatches.tsx:29` falls back to
   `#000000` against Never-Black.
7. **Guards.** Extend `design-tokens.test.ts` to reject raw radius / z-index /
   font-size outside the token scales, as it already rejects colour literals.
8. Split `styles.css` by layer (tokens, primitives, chrome, apparatus, views).

Waits on the Track B screenshot + axe baselines, which are the regression net
for a stylesheet-wide change.

## C3 — per-surface critique (after C2)

Each: `/impeccable critique <surface>` (two isolated assessments + detector,
browser evidence at desktop and narrow widths, both worlds) → surface contract
in `apps/web/.impeccable/surfaces/` → `polish`; `bolder`/`typeset` permitted on
the inspector, rail and record line.

| #   | Surface                                                      | Contract | Known going in                                                  |
| --- | ------------------------------------------------------------ | -------- | --------------------------------------------------------------- |
| 1   | Record panel (Inspector, RecordFields, Provenance, Swatches) | none     | the signature component; segmented items 26px tall (off-rhythm) |
| 2   | Tool rail + flyouts                                          | none     |                                                                 |
| 3   | Record line + zoom cluster                                   | none     |                                                                 |
| 4   | Context menu, search, arrange bar, format bar                | none     | search input `outline: none` with no ring; `:focus` not visible |
| 5   | Comments, mentions, presence                                 | none     | 999px pills are back, against the Sharing refusal               |
| 6   | BoardLocked, BoardGone, notices (quarantine), toasts, errors | none     | `harden` + `clarify` on copy                                    |
| 7   | Selection apparatus                                          | none     | handle radius 2px vs 4px; FrameView/TableView divide by zoom    |
| 8   | Object views (11 types + 8 semantic slips)                   | none     | shape fill-vs-stroke contrast never checked (PRODUCT.md)        |
| 9   | Home, account, share                                         | yes      | re-critique for regressions                                     |
| 10  | Boot splash                                                  | none     | inline styles, own timings                                      |

Closing pass: `/impeccable audit apps/web/src` (a11y, performance, theming in
both worlds, responsive/touch), then `impeccable-finish-reviewer` per surface.
