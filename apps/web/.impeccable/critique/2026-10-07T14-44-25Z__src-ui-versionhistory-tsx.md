---
target: version history panel and preview
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/user/open-frame/apps/web/src/ui/VersionHistory.tsx"
target_fingerprint: "sha256:916bb6fb23d1d006e8bc5bfac0520f3faa3e6ba706495e7f8ffc842f61aabe71"
target_path: /home/user/open-frame/apps/web/src/ui/VersionHistory.tsx
timestamp: 2026-10-07T14-44-25Z
slug: src-ui-versionhistory-tsx
---
# Critique: version history panel and preview

Method: dual-agent (A: design review · B: detector, axe, measurements, keyboard walk). Programme PR 3, batch critique 2026-10-07. Detector CLI: 0 findings on every component; browser overlay findings were false positives unless listed.

Heuristics: 1:3 2:3 3:3 4:2 5:3 6:2 7:2 8:2 9:3 10:2 = 25/40.
Specificity: behaviour specific (Back to now; current board kept before restore), visuals generic (borrowed of-mentions list).
Priority issues:
- [P1] Board menu and version sheet have no surface: items drawn over the grid (history--board-menu--*-1280, history--empty--*). Fix: BoardMenu root `of-menu of-surface` like ContextMenu; one surface panel wrapping list + name form; own list styles. /impeccable polish
- [P1] Preview bar overflows at 390: title clipped under Restore, "Back to now" off-screen (history--preview--notebook--390). Fix: drop nowrap at history.css:59, wrap title above actions, time-only title when narrow. /impeccable adapt
- [P2] Focus lost to BODY on entering a preview, on Back to now and on Escape; preview entry/exit not announced (B). Fix: focus the bar's heading or Back to now; announce "Viewing …"/"Back to now". /impeccable harden
- [P2] Restore never says the earlier board was kept; preview drops the version's name. /impeccable clarify
- [P2] Deleting a named version is one press, permanent. Two-press pattern. /impeccable harden
- [P3] Board menu: Escape after tabbing out does not close/return; version list has no arrow keys; "Name this version"+"Save" names the board as it is now.
Evidence: axe 0 violations; min contrast 5.47 (timestamps); list sheet overlaps rail 4px at 390.
