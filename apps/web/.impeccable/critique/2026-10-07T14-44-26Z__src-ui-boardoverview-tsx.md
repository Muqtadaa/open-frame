---
target: board overview
total_score: 22
max_score: 36
na_heuristics: 9
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/open-frame/apps/web/src/ui/BoardOverview.tsx"
target_fingerprint: "sha256:da01b374f3ff01d5fb54d9bf9d24e2bd55096789c244d3ec4e933a77f312ca50"
target_path: /home/user/open-frame/apps/web/src/ui/BoardOverview.tsx
timestamp: 2026-10-07T14-44-26Z
slug: src-ui-boardoverview-tsx
---
# Critique: board overview

Method: dual-agent (A: design review · B: detector, axe, measurements, keyboard walk). Programme PR 3, batch critique 2026-10-07. Detector CLI: 0 findings on every component; browser overlay findings were false positives unless listed.

Heuristics: 1:3 2:2 3:3 4:2 5:3 6:3 7:3 8:2 9:n/a (no error states) 10:1 = 22/36.
Specificity: high — "Citing nothing" first is the provenance principle made navigable.
Priority issues:
- [P1] The rail paints over the dialog at 390 (z-search 8 < z-chrome 10) (overview--expanded--notebook--390). Raise while open. /impeccable adapt
- [P1] Pointer and touch users cannot find it: Alt+S only, written only in the canvas description. Add to the Board menu and the empty-canvas context menu. /impeccable onboard
- [P2] Counts read broken ("2 insight", "1 sticky"); use registry display nouns with plurals. /impeccable clarify
- [P2] Click toggles a frame, Enter visits it. /impeccable polish
- [P2] No focus containment: Tab drops to BODY while open (B); no aria-modal. /impeccable harden
- [P3] Frame row name mismatch (axe); mixed count units; first row pre-highlighted.
