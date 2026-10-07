---
target_identity: "file:/home/user/open-frame/apps/web/src/ui/StatusBar.tsx"
target_fingerprint: "sha256:a5f9537896ff0bcf7afa95e5557ea4164e20aa2112ab483ffe0ef8fcaefd7311"
target_path: /home/user/open-frame/apps/web/src/ui/StatusBar.tsx
timestamp: 2026-10-07T01-33-59Z
slug: src-ui-statusbar-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence)

# Critique: the board's navigation bar (apps/web/src/ui/StatusBar.tsx)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | "Is my work safe" is split: save state on the left, connection on the room chip seven controls away; the save state vanishes below 560px |
| 2 | Match system / real world | 2 | "● Shared" reads as a status but acts (copies a link / opens links); history and timer icons are both clocks |
| 3 | User control and freedom | 3 | Undo/redo always present; but under ~940px the name's box overlaps Undo |
| 4 | Consistency and standards | 2 | Four bordered treatments on one line (Share outline, mentions wash, running-timer pill, playing-music accent); contract breakpoints disagree with CSS |
| 5 | Error prevention | 3 | Name opens a sheet, never signs out; a non-owner's press on "Shared" silently copies |
| 6 | Recognition rather than recall | 2 | Timer, music, history, theme are icon-only; history hides in the Sign-in sheet below 600px |
| 7 | Flexibility and efficiency | 2 | Shortcuts only for undo/redo |
| 8 | Aesthetic and minimalist design | 1 | 14 elements for a shared owner, your initial twice, the loudest things are two chips, not the name |
| 9 | Error recovery | 3 | A failed save is inked, announced, and says what to do |
| 10 | Help and documentation | 3 | Every control tipped, with shortcuts |
| **Total** | | **23/40** | Acceptable — fine parts, no whole |

## Design Specificity Verdict

LLM: half authored, half generic. Left of the second rule is OpenFrame — the board's name as the page's h1, "Saved" where an object count used to be, failure-only announcement, undo that hands focus to redo. Right of it is a SaaS toolbar that grew a control per feature: eight peers (timer, music, room chip, your face, history, mentions, account, theme) plus Source, separated by gaps alone. The code's own comments have drifted ("next to the source offer", "after the rule" where there is no rule); DESIGN.md's Order omits history, timer and music.

Deterministic scan: CLI `impeccable detect` over the 11 bar files — 0 findings. Live detector — its save-state low-contrast and text-overflow hits are false positives (it read the `[data-tip]::after` tooltip; the real pairs are 6.16:1 and 8.01:1). One real rule hit: `ai-color-palette` on the pressed After Hours theme toggle (cyan on dark) — on-brand for After Hours, but it is the brightest thing on the bar for a preference. All enabled controls pass 4.5:1 in both worlds.

## Overall Impression

Well-made parts with no composition. The biggest opportunity is zoning: the bar should answer, left to right, *where am I · is it safe · what is this session doing · who is here · me*, with one outlined verb (Share) and nothing else boxed at rest.

## What's Working
- The save state as the record: the product's local-first promise in one word, inked and announced only on failure.
- Keyboard craft: nav landmark with the name as h1, explicit names everywhere, undo→redo focus hand-off, editor-aware undo.
- Conditional presence: selection count, mentions, agent changes, and the viewer's timer/music appear only when relevant — the structure for hiding exists, it just doesn't extend to grouping.

## Priority Issues

**[P1] It runs out of the bar.** Measured (B): on a shared, signed-in board controls overflow in four bands (380–430, 560–610, 680–730, 820–910px); at 820px the theme toggle and Source sit off-screen yet stay in the tab order. With a session running (A), content is 811px in a 718px box at 760px. Under ~940px the name's 10ch min-width box overlaps Undo (at 390 Undo is drawn under "Untitled"). The tests pass because they never measure the maximal state. Fix: measured priority-plus overflow instead of per-state breakpoints; the name's min-width never above its heading's; test the maximal state. → /impeccable adapt, harden

**[P1] No hierarchy or grouping.** Eight peer controls in one run, four competing box treatments; visual weight goes to whatever is boxed (mentions chip, "Shared"), not to the name and the save state. Fix: zones (place · record · session · people · me), one bordered element at rest (Share), accent only on what is asking for attention. → /impeccable distill, layout

**[P2] The room chip is three things, and you appear twice.** It is connection status, the share action, and a silent copy for non-owners; it announces "Shared", not what it does. Your initial is in the faces and in the account. Fix: connection joins the save state as one safety readout; Share becomes a verb button; faces show others only. → /impeccable clarify

**[P2] Controls filed in the wrong place.** The theme is a device preference on a board's masthead; version history sits among people and hides in the Sign-in sheet on narrow screens; mentions (cross-board inbox) and agent changes (this board's audit) are look-alike chips side by side. Fix: history into a board-name menu, theme into the account sheet, mentions and agent changes as one inbox. → /impeccable distill

**[P2] Session tools are loose and disagree when running.** Timer and music are separate icon buttons placed before the people (DESIGN.md says beside), becoming two differently styled boxes when active. Fix: one session cluster — a single pill "⏱ 24:59 · ♪" while active. → /impeccable layout, polish

## Persona Red Flags
- Facilitator in a 25-minute synthesis: the timer she runs weighs the same as the theme toggle; "time's up" shares its wash with an unread mention; at 760px with a session running her account and theme spill out.
- Cross-functional newcomer from a link: "● Shared" looks like a label and silently copies a link; four icons with no words; signed out on a local board there is no Share and no hint why.
- Keyboard / screen-reader user: no grouping (no role=group per zone); the room chip announces a status; your face announced twice; focus lands on off-screen controls at narrow widths.

## Minor Observations
- "Untitled" floats centred in a 104px box (10ch min-width + centred text).
- Disabled undo/redo take the prime position after the name on every fresh board.
- A read Mentions chip stays an outlined box for good.
- Breakpoints: contract says 640/480, DESIGN.md 820/640/560, CSS 820/680/600/560/420.
- With accounts disabled, history (and the sheet fallbacks) are unreachable below 600px.
- Source is being removed (owner's decision); its 820px rule and sheet fallbacks go with it.

## Questions to Consider
- If "Saved" is the board's one reassurance, why is it the smallest, quietest thing on the bar, and gone on a phone?
- Should undo/redo live with the zoom cluster ("how the board is handled"), leaving the masthead to answer where/safe/who?
- Does a board's bar need a cross-board inbox, or only this board's activity?
