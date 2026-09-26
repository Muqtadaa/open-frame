---
target: "selection apparatus (C3 #7)"
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/open-frame/apps/web/src/canvas/SelectionOverlay.tsx"
target_fingerprint: "sha256:0d70cb2a97303069ceb77f3e608d1fab77ca9e1c54405b302c3f48bf37461d0d"
target_path: /home/user/open-frame/apps/web/src/canvas/SelectionOverlay.tsx
timestamp: 2026-09-26T07-26-00Z
slug: src-canvas-selectionoverlay-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Box and handles stay behind during a move and a connector reshape; no size or angle readout |
| 2 | Match system / real world | 3 | Guides and crop brackets read well; a box around a line does not |
| 3 | User control and freedom | 3 | Escape deselects, one undo per gesture; Escape does not cancel a drag, unlock only via context menu |
| 4 | Consistency and standards | 2 | Press targets 24/22/14/12/10/9px by family; group gets a bare box; crop corners outside, edges on |
| 5 | Error prevention | 3 | Outward targets good; at 25% a 40px shape's middle press resizes it |
| 6 | Recognition rather than recall | 2 | Crop is double-click only, fit is a hidden double-press, stops appear on hover only, lock tip unreachable |
| 7 | Flexibility and efficiency | 2 | Nudge only; no keyboard resize/rotate/lock; objects never focusable |
| 8 | Aesthetic and minimalist design | 3 | Calm at 100%; four grip families pile onto small objects and at 5% |
| 9 | Error recovery | 3 | Undo solid; lock explained visually only |
| 10 | Help and documentation | 1 | Nothing hints at crop, stops, fit; the one tooltip cannot show |
| **Total** | | **24/40** | **Acceptable — solid engineering, unauthored look, gaps in truth and reach** |

## Design Specificity Verdict

**LLM assessment:** careful and correct but category-interchangeable. 9px panel-white squares with a blue edge, a blue outline, magenta hairline guides and a 10% marquee wash are what Figma or tldraw ship. OpenFrame shows through only in the retinting tokens, the crop brackets and the padlock chip. DESIGN.md has no Selection/Handles component entry at all; the handle's spec lives only in styles.css.

**Deterministic scan:** `detect` on src/canvas and FrameView/TableView: 0 findings (the detector cannot see inline-style TSX). On styles.css, 4 findings, none apparatus: the ruled home ground (false positive), two colour-picker internals (intentional), Georgia in a fallback stack. The live overlay injected on a selection and reported 2 anti-patterns outside the apparatus (cramped .of-choice padding; #4e6070 on #16202b at 2.5:1; a probable false positive on the save state). The browser measurements carried this run.

## Overall Impression

The hard problem — screen-constant apparatus outside the world transform — is genuinely solved: every overlay measures the same at 25% and at 1600%, in both worlds. What is missing is truth during the most common gesture, reach for anyone not holding a mouse, and a look anyone would recognise as OpenFrame's.

## What's Working

1. Rule 24 holds for every overlay: handles 9px, rotate grip 15px, connect points 8px at every zoom, including rotated.
2. Press targets reach outward, so small objects stay movable at 100%; resize corners are 27.5px.
3. Each grip family has its own silhouette, and crop mode replaces the resize grips rather than adding to them.

## Priority Issues

**[P1] The selection box does not follow a move or a connector reshape.** `SelectionOverlay.tsx:70-76` previews only resize and rotate; during a move the outline and eight live handles stay at the old place (paper-15, ah-15), and a stop drag leaves a stale box. The most frequent gesture looks broken. Fix: apply the move delta and the reshape preview; e2e compares overlay and object mid-drag. `/impeccable polish`

**[P1] FrameView still divides its border by the zoom (rule 24).** `FrameView.tsx:26, :88` `borderWidth: 1 / zoom` paints 1/4/16px at 100/400/1600% (frame-z1600). TableView is clean. Fix: draw the hairline outside the world or on a `scale(1/zoom)` child; extend apparatus.spec to measure it. `/impeccable polish`

**[P1] No keyboard or assistive-technology path.** Objects and handles are never focusable or named, Tab never reaches the board, selection is not announced, and only nudge exists — no resize, rotate, lock (WCAG 2.1.1, 2.5.7). `toggle-lock` is handled but the keymap never emits it. Fix: roving focus over objects in the application, a polite selection summary, keys for resize/rotate/lock, or fields in the record panel. `/impeccable harden`

**[P2] Press targets disagree, and the finest gesture has the smallest.** Connector ends and stops 9×9 with no target; legs 10; edge strips 12 (7 on a 40px shape); dividers 14; crop edges 21; middle handles and connect points 22 (measured from the padding box, 1px short). At 25% a 40×40 shape's middle press hits handle s and resizes it. Crop grips reach 11-21px inside the image. Fix: a 24px `__target` on every grip, inset from the border box; collapse small selections. `/impeccable adapt`

**[P2] The accent vanishes where it is needed.** Accent 2.23:1 and guide 2.56:1 on a black fill (default); accent 1.67:1 on white and guide 2.67:1 (After Hours); 1.01-1.22:1 against every coloured connector ink, so endpoints, legs and the midpoint disappear on a coloured line; leg bar 2.64:1 in the default world. Fix: a page-coloured halo under outline and handles (a two-tone edge), guarded in design-tokens.test. `/impeccable colorize`

## Persona Red Flags

**Alex (power user):** no W×H readout while resizing or angle while rotating; guides carry no distances; a lock shortcut that is handled but never bound.

**Jordan (first-timer):** crop only behind a double-click and absent from the record panel; stops only within 20px of hover; fit-to-text an unhinted double-press; a dot 26px above a sticky reads as a rotate handle on a type that has none.

**Sam (keyboard / screen reader):** `.of-handle`, `.of-edge`, `.of-endpoint`, `.of-connect-point`, `.of-crop__grip` are pointer-only divs; no object takes focus; the lock's label sits on an inert div; selection changes are silent.

**Riley (touch / trackpad):** 9, 10, 12, 14px targets; no hover or active state on any grip; at 5% the handles bury the object.

## Minor Observations

- A group selection is a bare box with connect points, no grips, no panel, no badge — DESIGN.md calls exactly this a bug.
- The padlock has `pointer-events: none`, so its tip never shows; the record panel disappears for a locked selection.
- A selected connector gets an axis-aligned box around the line as well as its end handles.
- Cursors do not turn with a rotated object; endpoints and "add bend" share crosshair; no grabbing state.
- Connect points stay on the axis-aligned bounds of a rotated object; an incoming arrowhead floats off a rotated outline.
- Your own selection (1.5px, computes to 1px) looks lighter than a peer's (2px dashed with a wash). DESIGN.md says 1.5px.
- Escape mid-drag clears the selection and still commits the move; in crop, one Escape leaves crop AND deselects.
- Members of a multi-selection look like bystanders inside the union box.
- The handle's 2px radius is undocumented (the "4px" lead was DESIGN.md's apparatus radius, not the handle's).
- Hover-revealed stops pop in; no hover tier on unselected objects.
- axe: `meta-viewport` (page zoom disabled) and `region` (rail and zoom slider outside landmarks) — outside this surface, noted for the audit.

## Questions to Consider

- What would a handle look like as a margin tick on the quadrille rather than a square any editor ships?
- Should a selection under ~48px on screen collapse to corners only?
- Why does the most frequent gesture, moving, get the least truthful apparatus?
