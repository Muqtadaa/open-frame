---
target: session music sheet and listen prompt
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/home/user/open-frame/apps/web/src/ui/SessionMusic.tsx"
target_fingerprint: "sha256:ab65046349731916f868ff0fc209a1164455585cd2925dd53f4fe22dd96f18de"
target_path: /home/user/open-frame/apps/web/src/ui/SessionMusic.tsx
timestamp: 2026-10-07T14-44-26Z
slug: src-ui-sessionmusic-tsx
---
# Critique: session music sheet and listen prompt

Method: dual-agent (A: design review · B: detector, axe, measurements, keyboard walk). Programme PR 3, batch critique 2026-10-07. Detector CLI: 0 findings on every component; browser overlay findings were false positives unless listed.

Heuristics: 1:2 2:3 3:3 4:2 5:3 6:3 7:3 8:3 9:2 10:3 = 27/40.
Specificity: concept specific (one room playlist, the prompt names who started it); controls generic.
Priority issues:
- [P2] Pill hides state: playing and paused render the same; only the aria label differs. /impeccable clarify
- [P2] Two primary buttons in one sheet (timer Start + music Play) and misaligned action rows. /impeccable layout
- [P2] Genre radiogroup is not a radio group: every radio is a Tab stop and arrows do nothing (B, SessionMusic.tsx:337); up to 10 options. Roving tabindex like the Inspector's. /impeccable harden
- [P2] Listen prompt: Escape does not dismiss; keyboard Dismiss drops focus to BODY; 13 Tabs to reach (end of DOM) (B). /impeccable harden
- [P2] Mute state weak (text colour only; label stays "Mute"; pill never shows muted). /impeccable polish
- [P3] Volume slider 158x16 (<24px target); sheet covers rail by 24px at 390; refused audio and missing catalogue fail silently.
Evidence: axe 0 violations; Play/Pause focus moves correctly to the next control.
