---
target: the record panel (Inspector)
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/user/open-frame/apps/web/src/ui/Inspector.tsx"
target_fingerprint: "sha256:a86ea83ed5f238ef318bf8d407fe7544fe6c1f78f94f1b438afe0ce23f7a8fe8"
target_path: /home/user/open-frame/apps/web/src/ui/Inspector.tsx
timestamp: 2026-09-25T00-53-07Z
slug: src-ui-inspector-tsx
---
Method: dual-agent (A: design review · B: detector + browser), synthesised.

## Design Health Score — 21/40 (Acceptable)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | A fresh sticky's default colour is not marked in the grid; evidence placeholders read as stored values |
| 2 | Match system / real world | 2 | "down" for vertical alignment; "fill" and "line" each name two different things; the title is a type id |
| 3 | User control and freedom | 2 | One colour-picker drag = ~20 undo entries; each opacity step = one |
| 4 | Consistency and standards | 2 | Native selects beside custom segmented beds; segmented items 28×26 under the 30px target |
| 5 | Error prevention | 2 | Delete is the first Tab stop from the canvas |
| 6 | Recognition over recall | 3 | Tips everywhere; radio names are raw tokens ("start", "medium") |
| 7 | Flexibility and efficiency | 1 | No arrow keys in radiogroups (9 Tab stops for 3 groups); Promote only in a context menu the panel paints over |
| 8 | Aesthetic and minimalist | 3 | Quiet, on-system in both worlds; hierarchy flat |
| 9 | Error recovery | 2 | No save/reject feedback; the picker's contrast line is the one good case |
| 10 | Help and documentation | 2 | Nothing says what source / participant / tags are for |

## Design specificity

Partly authored. Mono lowercase record labels, ink swatches as specimens, the provenance trail and the picker's stated contrast belong to this product; the frame — floating card, stacked segmented rows, a slider — is a generic property inspector. The product thesis (a note and evidence are the same thing, different payload) is invisible: the subject line is the faintest text in the panel and the record fields share the cosmetic rows' grammar.

Deterministic scan: `impeccable detect` on the five panel files — 0 findings; whole `src` — the 6 known deliberate hits. In-page overlay: nothing in the panel (one hit on the record line's board title, overflowing by 48px). axe-core scoped to the panel: 0 violations in both worlds. Contrast: every text pair ≥ 5.78:1 in both worlds. Fonts: nothing under 12px; the fill/text target items fall back to the browser's 13.33px.

## Priority issues

**[P0] Continuous controls write per event.** `ColorPicker.commit` → `onPick` → `UpdateStyle` on every pointer move (ColorPicker.tsx:86–91); opacity dispatches per step (Inspector.tsx:579). One drag measured ~20 undo entries. Breaks CLAUDE.md rules 4 and 14 — floods undo, saves, and later the network. Fix: preview locally, dispatch ONE command on pointer-up / keyup / blur, like every other gesture. → `/impeccable harden`

**[P1] The panel covers what you reach for next.** It paints over an open context menu (64×337 on a sticky, 64×480 on evidence — "Promote to evidence" is clipped), and it covered the object a shift-click aimed at; at 760px it covers the selection's lower handles. Fix: the context menu goes above the panel (or the panel yields while a menu is open); placement avoids the pointer's next likely target. → `/impeccable layout`

**[P1] Placeholders impersonate data.** Evidence placeholders are realistic examples in ink close to value ink, so an unsourced slip looks sourced — against PRODUCT.md's "provenance intact" success criterion. Fix: an empty state nobody mistakes for a value. → `/impeccable clarify`

**[P1] The signature panel has no head.** The subject is 12px muted mono, the same as every label; record and appearance share one grammar. Fix (bolder-chrome scope): the type noun as a real title with the object's summary under it; promote/change type in place; a named "record" band above a collapsible "appearance". → `/impeccable bolder`, `/impeccable layout`

**[P2] Status, vocabulary and keyboard.** Default colour unmarked; the picker opens on grey for a yellow note; "fill"/"fill", "line"/"line", "down"; Delete first in focus order; radiogroups without arrow keys; segmented items 28×26; opacity range 18px tall (WCAG 2.5.8 unless spacing exempts it). → `/impeccable clarify`, `/impeccable harden`

## Persona red flags

- **Alex (power user):** Promote is right-click only and hidden under the panel; ~35 Tab stops to opacity; fields cannot be set across a multi-selection, so tagging 12 slips is 12 round trips.
- **Sam (keyboard / screen reader):** Delete first; no arrow keys; the group announces "Selected object properties" without the type; no current swatch on a fresh note.
- **Riley (stress tester):** one drag → ~20 undos; the panel swallows the next shift-click; at 760px it covers handles and the record line; the open picker covers the opacity reading.

## Minor observations

"colour" label centres on the grid, not the target tabs; DESIGN.md says 7px bed radius, CSS is 6px (the scale's control step — DESIGN.md is stale); a mixed selection says "2 objects" rather than "1 sticky · 1 shape" and shows no "mixed" state; a connector offers a "fill" target; ~80px of the control column is dead on most rows.

## Questions to consider

1. If a note and evidence are the same thing, why can't you change what it IS where you are looking at it?
2. Should appearance collapse by default on semantic types, so the record is the panel?
3. Should the record half dock while only appearance floats beside the selection?
