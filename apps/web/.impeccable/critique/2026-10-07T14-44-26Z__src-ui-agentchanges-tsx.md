---
target: agent changes
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/open-frame/apps/web/src/ui/AgentChanges.tsx"
target_fingerprint: "sha256:2dc577af585ab77a154e20bae442c3b997c99857335ff10f67365ebf1027cca0"
target_path: /home/user/open-frame/apps/web/src/ui/AgentChanges.tsx
timestamp: 2026-10-07T14-44-26Z
slug: src-ui-agentchanges-tsx
---
# Critique: agent changes in the Inbox

Method: dual-agent (A: design review · B: detector, axe, measurements, keyboard walk). Programme PR 3, batch critique 2026-10-07. Detector CLI: 0 findings on every component; browser overlay findings were false positives unless listed.

Heuristics: 1:2 2:1 3:3 4:3 5:2 6:1 7:2 8:3 9:2 10:2 = 21/40.
Priority issues:
- [P1] BUG: "Make a frame" cannot be reverted — refused as changed/deleted/locked since, though nobody touched it; quotes nested twice in the message (B). Root-cause in the frame create + revert guard. /impeccable harden
- [P1] Machine copy: "Create 3 object(s)" unresolved in toast, row and Revert name; repeats the meta count; meta wraps "1 / object". Pluralise and name types at the MCP label. /impeccable clarify
- [P1] No "show me": a row cannot select/frame the objects it touched before reverting. /impeccable clarify
- [P2] Focus lands on Revert when the Inbox opens; after Revert focus falls to BODY; Tab leaves the open sheet (B). /impeccable harden
- [P2] Partial revert result only announced, never shown. /impeccable harden
- [P2] Inbox button sometimes does not open from the keyboard after a toast dismiss (B, not isolated). /impeccable harden
- [P3] At 390 the Inbox is a bare count disc.
