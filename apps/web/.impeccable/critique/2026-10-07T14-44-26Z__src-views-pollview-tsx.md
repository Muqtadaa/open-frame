---
target: poll card
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/open-frame/apps/web/src/views/PollView.tsx"
target_fingerprint: "sha256:0c56316c3d352ee97d99dab4aa1d882395ac67fc36ead2f8e45cafefd62d6b74"
target_path: /home/user/open-frame/apps/web/src/views/PollView.tsx
timestamp: 2026-10-07T14-44-26Z
slug: src-views-pollview-tsx
---
# Critique: poll card

Method: dual-agent (A: design review · B: detector, axe, measurements, keyboard walk). Programme PR 3, batch critique 2026-10-07. Detector CLI: 0 findings on every component; browser overlay findings were false positives unless listed.

Heuristics: 1:3 2:3 3:3 4:3 5:2 6:3 7:2 8:3 9:2 10:2 = 26/40.
Specificity: ink-wash bars in the card's own ink; answer count always visible.
Priority issues:
- [P1] Record-panel booleans truncate ("several an…", "hide resul…") — the settings that define the poll. Label after the checkbox at full width in the field renderer. /impeccable clarify
- [P1] At 390 a selected poll's Close control is covered by the record panel (hit test returns the panel) and the rail covers the card's left 85px (B). /impeccable adapt
- [P2] A closed poll looks like an open one. /impeccable polish
- [P2] Own answer marked by a 1px ring only. /impeccable polish
- [P2] Any editor can close; options can be renamed after answers. /impeccable harden
- [P3] axe label-content-name-mismatch on options (name adds ", 1 answer, 50%"); no announcement on answering; After Hours option edges use interface purple on user paper; share at opacity .7.
Evidence: keyboard answering and closing work.
