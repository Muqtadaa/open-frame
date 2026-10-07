---
target: AI cluster review
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/open-frame/apps/web/src/ui/ClusterReview.tsx"
target_fingerprint: "sha256:37811fd17305d4199100679fb13da3851b55ca801c021760328ee448c18f9e58"
target_path: /home/user/open-frame/apps/web/src/ui/ClusterReview.tsx
timestamp: 2026-10-07T14-44-25Z
slug: src-ui-clusterreview-tsx
---
# Critique: AI cluster review

Method: dual-agent (A: design review · B: detector, axe, measurements, keyboard walk). Programme PR 3, batch critique 2026-10-07. Detector CLI: 0 findings on every component; browser overlay findings were false positives unless listed.

Heuristics: 1:3 2:3 3:3 4:3 5:2 6:3 7:1 8:3 9:2 10:3 = 26/40.
Specificity: the most product-specific of the batch (Anthropic named before sending, runs left, copiedFrom provenance).
Priority issues:
- [P1] The review covers the notes it describes (cluster--review--*-1280: 316x180 overlap with the selection; at 390 the panel + bottom-sheet inspector hide the board). Fix: hide the inspector while clustering; avoid the selection bounds. /impeccable layout
- [P1] Escape handled only inside the panel: after Tab leaves it (no containment, Tab drops to BODY), Escape clears the board selection and leaves the panel open on a stale selection; at 390 its Cancel then blocks the canvas (B). Fix: window-level Escape while open, focus containment, E1 focus return. /impeccable harden
- [P2] Escape in a theme field discards a paid proposal and its edits. First Escape leaves the field. /impeccable harden
- [P2] Copies arrive unannounced; after Apply focus drops to BODY and every note appears twice. Say "Adds a frame with copies of N notes; the originals stay", focus the new frame. /impeccable clarify
- [P2] Signed-out dead end ("AI needs an account" + Close only); opaque "did not match the notes". /impeccable harden
- [P3] Theme list hierarchy flat; disc bullets never render (overflow hidden). /impeccable typeset
