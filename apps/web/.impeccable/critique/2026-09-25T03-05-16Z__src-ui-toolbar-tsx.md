---
target: the tool rail and its flyouts
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/home/user/open-frame/apps/web/src/ui/Toolbar.tsx"
target_fingerprint: "sha256:61326ad32f8a7c39817028e6f0435a21209c3fbd96d5214418aa91ba3a65efd0"
target_path: /home/user/open-frame/apps/web/src/ui/Toolbar.tsx
timestamp: 2026-09-25T03-05-16Z
slug: src-ui-toolbar-tsx
---
Method: dual-agent (A: design review · B: detector + browser), synthesised.

## Design Health Score — 21/40 (Acceptable, significant work needed)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of status | 2 | Active and hover share one accent wash; chosen table size never shown on the rail |
| 2 | Match with real world | 3 | Frame's "#" is the snap toggle's glyph |
| 3 | User control | 1 | Flyouts ignore Escape and outside press |
| 4 | Consistency | 2 | Second press on Shape cycles, on Table opens a picker; rail tips have no dwell |
| 5 | Error prevention | 2 | 16px chevrons and grid cells; rail runs off windows under 640px tall |
| 6 | Recognition over recall | 2 | Shortcuts only on hover; U-cycling invisible; chevrons untipped |
| 7 | Flexibility | 2 | Letter keys good; no rail button can be pressed from the keyboard |
| 8 | Minimalist aesthetic | 3 | Quiet, on-system; 11 tools in one 599px run |
| 9 | Error recovery | 2 | Nothing recovers a clipped rail or a stuck flyout |
| 10 | Help | 2 | Tips are the only help; promotion undiscoverable |

## Design specificity
Styling is specific (margin rule, 50px rhythm, After Hours restraint); the model is the generic 11-icon column. Code, Hand and Comment hold three slots; the eight structured types have no entry point beyond right-click → Promote.

## Priority issues
- [P0] No rail button can be pressed from the keyboard: Enter/Space arrive defaultPrevented (use-keyboard-shortcuts: Space = pan, Enter = edit; isTextEntry does not exempt buttons). Flyouts and image import have no keyboard route. WCAG 2.1.1. Fix: global keys skip operable targets; e2e tab-and-press.
- [P1] Flyouts: 16×16 chevrons inside the tool corner (2.5.8 fail twice); 16px cells on 18px pitch, 64 tab stops; portaled before the rail in DOM so forward Tab never reaches them; no focus move, no arrows, no Escape/outside dismissal; shape flyout paints over the record panel by 45×136.
- [P1] Short windows: rail is a fixed 599px, centred, no max-height. 640 tall touches the record line; 560 tall top at −19 with Select/Image clipped; 760 wide overlaps the record line 64×14; table picker covers the record line.
- [P2] Tool set and grouping: navigate/make/annotate mixed; one divider sets Image apart; Code has a slot, structured types none; DESIGN.md describes the older rail.
- [P2] Weak active state (differs from hover by icon hue); tips lose to the inspector.

## Persona red flags
- Alex: diamond is four unseen U presses away; no key for table size or Image.
- Jordan: "#" reads as grid; chevrons unseen; second click on Shape silently changes it; never learns a note can become evidence.
- Sam: 13 tab stops, no roving tabindex; Enter does nothing; tips aria-hidden, no aria-keyshortcuts.

## Minor observations
- axe: one critical `label` violation on the rail's hidden file input.
- Image has no shortcut; N appears in no tip.
- Shape flyout highlights the current kind when Shape is not armed.
- DESIGN.md gives the disclosure as 16px and 12px.
- TOOLS is a hand-kept list (rule 21 drift).
- Detector: target clean; After Hours "cyan neon" on the active tool is the theme accent (false positive).

## Questions
- Should a flyout exist at all, if the rail remembers the last shape/size and the inspector changes them after placing?
- Does Hand earn a permanent slot?
