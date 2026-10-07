---
target: session timer
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:/home/user/open-frame/apps/web/src/ui/SessionTimer.tsx"
target_fingerprint: "sha256:4cf6dc3b16e4ce92aa41d41bedaef0403201d0cc51bfdfd0a7ceabef46ea14e7"
target_path: /home/user/open-frame/apps/web/src/ui/SessionTimer.tsx
timestamp: 2026-10-07T14-44-26Z
slug: src-ui-sessiontimer-tsx
---
# Critique: session timer

Method: dual-agent (A: design review · B: detector, axe, measurements, keyboard walk). Programme PR 3, batch critique 2026-10-07. Detector CLI: 0 findings on every component; browser overlay findings were false positives unless listed.

Heuristics: 1:2 2:4 3:2 4:3 5:2 6:3 7:3 8:3 9:2 10:2 = 26/40.
Priority issues:
- [P1] Paused looks identical to running on the pill; no paused rule; label lacks "paused". /impeccable clarify
- [P2] Start, Pause and Resume drop focus to BODY (button unmounts); Tab leaves the sheet; Alt+T does not close it (B). /impeccable harden
- [P2] Shared Reset is one unguarded press. /impeccable harden
- [P2] Pill time is 12px muted mono — not readable across a room. /impeccable typeset
- [P3] Idle shows 5:00 twice; unitless presets; "Started by" stale at zero; done pill "0:00" vs name "time's up" (axe mismatch); "+1 min" named "Add a minute" (axe mismatch); aria-description repeats name; sheet over rail at 390.
