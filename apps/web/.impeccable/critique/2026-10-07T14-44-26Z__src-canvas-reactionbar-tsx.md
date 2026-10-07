---
target: reactions
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/open-frame/apps/web/src/canvas/ReactionBar.tsx"
target_fingerprint: "sha256:6836f8a67401e50e89650f62ee70df31f9124143ae633791d059468f22bf05c8"
target_path: /home/user/open-frame/apps/web/src/canvas/ReactionBar.tsx
timestamp: 2026-10-07T14-44-26Z
slug: src-canvas-reactionbar-tsx
---
# Critique: reactions bar, chips and picker

Method: dual-agent (A: design review · B: detector, axe, measurements, keyboard walk). Programme PR 3, batch critique 2026-10-07. Detector CLI: 0 findings on every component; browser overlay findings were false positives unless listed.

Heuristics: 1:3 2:3 3:4 4:3 5:3 6:3 7:3 8:3 9:3 10:2 = 30/40.
Priority issues:
- [P1] At 390 the bar runs off-screen (x100-402 in a 390 viewport, More clipped) and lies over neighbours; picker covers the selected note (B). Clamp to the canvas; dock above the bottom sheet when narrow. /impeccable adapt
- [P1] Picker overlaps the record panel at 1280; pass the panel as avoid. /impeccable layout
- [P2] Chips 23px tall at 100% and shrink with zoom while pressable. /impeccable harden
- [P2] Chip names omit the count (axe mismatch "Agree" vs "Agree 2"); adding/removing a reaction is not announced (B). /impeccable harden
- [P3] Picking an already-used emoji from the library removes it; Tab leaves the open picker; flat 8-cell arrow jumps across groups.
Evidence: keyboard toggling works on chips and the bar; picker search+Enter works and returns focus.
