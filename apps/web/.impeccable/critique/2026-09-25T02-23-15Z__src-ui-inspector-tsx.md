---
target: the record panel (Inspector), re-run
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/open-frame/apps/web/src/ui/Inspector.tsx"
target_fingerprint: "sha256:f9cc4d39acd79c2f8f1ffb64226e0fbd4975774294d70e51355ae86fe6c4bf3f"
target_path: /home/user/open-frame/apps/web/src/ui/Inspector.tsx
timestamp: 2026-09-25T02-23-15Z
slug: src-ui-inspector-tsx
---
Method: dual-agent (A: design review · B: detector + browser), synthesised. Re-run after the fix pass.

## Design Health Score — 24/40 (Acceptable; was 21/40)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Live preview works; text and outline defaults still unmarked; connector's marker wrong |
| 2 | Match system / real world | 2 | "surface" offered for a line; tips show token ids ("start", "sans"); arrowheads filed under "record" |
| 3 | User control and freedom | 2 | Escape on opacity commits; Shift does not yield after a click inside the panel |
| 4 | Consistency and standards | 2 | Paint target is toggles where every other one-of-many is a radiogroup; swatches are 12 Tab stops |
| 5 | Error prevention | 2 | (Fixed during this run: arrows in a radio row also nudged the object); connector targets overflow |
| 6 | Recognition over recall | 3 | "face" is three near-identical "Aa" |
| 7 | Flexibility and efficiency | 2 | 19 Tab stops to cross a sticky's panel, 12 of them swatches |
| 8 | Aesthetic and minimalist | 3 | Calm; a shape carries 9 rows; connector head reads "Connector / Connector" |
| 9 | Error recovery | 3 | Undo covers everything |
| 10 | Help and documentation | 2 | Tips name tokens, not effects |

## First-run findings, verified

1. Continuous controls — **resolved** (B: a 20-move picker drag = 1 undo; 6 opacity steps = 1 undo). New: Escape on the opacity slider commits rather than reverting.
2. Menu and Shift — **menu resolved** (panel on top in 0 of 4,524 samples); **Shift partly**: yields from the board, not after a click inside the panel (focus stays on the swatch, `busy()` counts buttons).
3. Placeholders — **resolved** in both worlds.
4. Head — **partly**: title and summary work; the `record` band label shares the field labels' register, and a connector's route is filed under it.
5. Words / defaults / keyboard / targets — **mostly**: default surface marked, picker seeded, Delete last (stop 19/22), radiogroups one stop with arrows, every target ≥ 30px. Text and outline defaults unmarked; "text" names two rows on a connector; the dash group is still announced "line".

## Deterministic evidence

Detector on the five panel files: 0. Whole `src`: the 6 known deliberate hits. axe scoped to the panel: 0 violations, both worlds. Nothing under 12px; contrast ≥ 5.78:1 everywhere. In-page overlay: `cramped-padding` on the paint-target switch (real); `text-overflow` and `low-contrast` on the summary and `gray-on-color` on the title (false positives — deliberate ellipsis, wrong background sampled); After Hours "cyan neon" palette flag on the accent (the world's own accent, by decision).

## Priority issues

**[P0 — fixed in this run, c8c05d2] Arrows in a radio row also nudged the object.** The window keymap received them; two presses moved a sticky 2px and wrote twice per press. `stopPropagation` in `Choice.step`; e2e test failing without it.

**[P1] The evidence panel runs over the record line and the zoom cluster.** 539px tall with nothing that scrolls: at 1280×800 it paints over the status bar and zoom cluster by 13px; at 760×700 it covers the zoom cluster entirely, and A saw it cover the selection's own handles. → `/impeccable layout` (cap to the viewport and scroll the appearance band, or collapse appearance for semantic types)

**[P1] Shift does not yield once focus is in the panel.** Recolour, then shift-click the neighbour: nothing — the commonest flow still fails. Only text entry should count as busy. → `/impeccable harden`

**[P1] A connector's colour targets overflow and misname.** "surface text outline label" overflows 360px; "surface" and "outline" both paint the line; its default marker is grey where the line is drawn in ink. The registry should say what each target paints per type. → `/impeccable clarify`

**[P2] The record band is too faint, and holds geometry.** `record` / `appearance` read as field labels; route and arrowheads are not a record. Give the band real chrome (a ruled slip ground, "2 of 3 blank") and file only semantic fields under it. → `/impeccable bolder`

**[P2] Loose ends from the first pass.** Escape on opacity commits; text/outline defaults unmarked; every radio and swatch speaks its name twice (`aria-description` equals the name); the dash group is announced "line"; the "on" swatch mark is a 1px ink edge, weak in After Hours; the context menu at 760×700 runs 7px off the bottom without scrolling. → `/impeccable polish`

## Persona red flags

- **Alex:** recolours, shift-clicks the neighbour — nothing; 19 Tab stops to cross.
- **Jordan:** promotes a note and it turns grey; reads "record" as another label; meets "surface" on a line.
- **Sam:** hears every radio and swatch twice; the dash group is "line"; Escape on opacity closes the panel instead of undoing.

## Questions to consider

1. If the record is the thesis, should appearance collapse by default on semantic types — which would also fix the panel's height?
2. Should a blank on evidence be visible on the card itself, not only inside a panel that exists while it is selected?
