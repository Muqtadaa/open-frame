---
target: dot voting
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/open-frame/apps/web/src/ui/VotingBanner.tsx"
target_fingerprint: "sha256:b35edf57adbc4edad5ab899024584a6c0fd4f2eaf4af1afb682e9e0266558047"
target_path: /home/user/open-frame/apps/web/src/ui/VotingBanner.tsx
timestamp: 2026-10-07T14-44-26Z
slug: src-ui-votingbanner-tsx
---
# Critique: dot voting setup, banner, dots, results

Method: dual-agent (A: design review · B: detector, axe, measurements, keyboard walk). Programme PR 3, batch critique 2026-10-07. Detector CLI: 0 findings on every component; browser overlay findings were false positives unless listed.

Heuristics: 1:3 2:3 3:3 4:3 5:2 6:3 7:3 8:2 9:2 10:2 = 26/40.
Specificity: turnout without counts, tie order, Select top 3 are product-specific; the count pill is a generic badge.
Priority issues:
- [P1] Count pill covers the note's own words (voting--dots-cast--notebook--1280). Straddle the corner. /impeccable layout
- [P1] Banner breaks at 390 and blocks the board: 195px wide, status wraps 4 lines, overlaps rail 4px; hit tests at 15-50% of the top note's height return the banner at BOTH widths; at 390 open results block Alt-click (B, detector text-occlusion 77%). Fix: anchor from the rail under 520px, single row, keep-clear of notes. /impeccable adapt
- [P1] Dots cannot be cast or taken back by keyboard (Vote then Enter opens the editor); taking back is Alt-click only, impossible on touch (B). Fix: Enter/Backspace on the selected note while the vote tool is armed; menu path surfaced. /impeccable harden
- [P2] Focus drops to BODY after Start, Cancel, Escape, End, Reveal (E1); setup has no containment; invalid "Votes each" gives no message. /impeccable harden
- [P2] Running out of votes is shown as a red error toast; end of round is anticlimactic (results behind a button, local state). /impeccable clarify, /impeccable delight
- [P2] Reveal and Clear are one unguarded press in a live room. /impeccable harden
- [P3] Voters not told counts are hidden; results rows named "<gist><count>" with no separator; bar width jumps between states.
