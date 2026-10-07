---
target: people sheet
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/open-frame/apps/web/src/ui/PeopleSheet.tsx"
target_fingerprint: "sha256:83ff34c7cafc704cac2c2b262d1b8a6e088a7192ad94d4a75adfc2fd38789714"
target_path: /home/user/open-frame/apps/web/src/ui/PeopleSheet.tsx
timestamp: 2026-10-07T14-44-26Z
slug: src-ui-peoplesheet-tsx
---
# Critique: people sheet and nav faces

Method: dual-agent (A: design review · B: detector, axe, measurements, keyboard walk). Programme PR 3, batch critique 2026-10-07. Detector CLI: 0 findings on every component; browser overlay findings were false positives unless listed.

Heuristics: 1:2 2:3 3:3 4:3 5:3 6:2 7:2 8:4 9:2 10:2 = 26/40.
Priority issues:
- [P1] Following is nearly invisible (1.5px ring on a 24px face) and starts and ends silently; nothing announced (B). Show "Following Ash" with Stop; announce start and end. /impeccable clarify
- [P2] Rows give no visible cue they are choices; no heading or count. /impeccable clarify
- [P2] Label flips to "Stop following" while aria-pressed is also set; axe name mismatch on follow buttons. Stable label + pressed. /impeccable harden
- [P2] Tab leaves the open sheet for the rail; at 390 the rail can paint over the sheet's left edge (B). /impeccable harden
- [P3] Hue collisions (two purples, two greens); +N names only in the description; faces 24px under coarse pointer.
