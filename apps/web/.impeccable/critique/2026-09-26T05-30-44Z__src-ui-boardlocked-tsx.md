---
target: "blocked and degraded states (C3 #6)"
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/home/user/open-frame/apps/web/src/ui/BoardLocked.tsx"
target_fingerprint: "sha256:21982d626b06c9bea0153ef5a4238724e592a7b417f887e25bd54047025d7689"
target_path: /home/user/open-frame/apps/web/src/ui/BoardLocked.tsx
timestamp: 2026-09-26T05-30-44Z
slug: src-ui-boardlocked-tsx
---
Method: dual-agent (A: design review · B: detector + browser measurements), every state driven live, both worlds, 1280 and 760.

Target: C3 #6 — blocked and degraded states: password gate (BoardLocked), deleted board (BoardGone), degraded-load notice (NoticeBanner), toast, start-up failure (splash / AppErrorBoundary), unknown and fallback object views, per-object error boundary.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | A quarantined board renders empty, titled "Untitled board"; "Saved" shows behind the deleted and password gates |
| 2 | Match System / Real World | 2 | "(newer-schema)", "1 object(s)", "kanban-card", "The room could not be reached." |
| 3 | User Control and Freedom | 2 | No way out of the password gate; the start-up failure has nothing to press |
| 4 | Consistency and Standards | 2 | "Read-only." vs "Read only"; the toast and the advisory notice wear the blocking notice's red |
| 5 | Error Prevention | 1 | A read-only board accepts new notes and edits and discards them; a deleted board is still editable by keyboard |
| 6 | Recognition Rather Than Recall | 3 | The read-only reason lives in a hover-only tip on a span once the notice is dismissed |
| 7 | Flexibility and Efficiency | 2 | A wrong password drops focus to the body; nothing is focused on the deleted dialog |
| 8 | Aesthetic and Minimalist Design | 3 | Gates are restrained and on-system; the brand splash is reused as the failure screen |
| 9 | Error Recovery | 1 | Read-only offers no next step; "Reloading may help" with no reload; Home spins forever when storage fails |
| 10 | Help and Documentation | 2 | "Ask whoever sent it" is good; nothing explains read-only, unsupported objects, or private windows |
| **Total** | | **20/40** | **Acceptable (at the floor)** |

## Design Specificity Verdict

**LLM:** the copy is authored — "Whoever owns it removed it while you had it open. Nothing you change here can be saved." names who did what and what it means. The mechanics beneath are generic and in two places false: the gates claim `aria-modal` and are not modal to the keyboard, and "read-only" accepts edits. Every message — advisory, blocking, transient — is the same red `.of-notice`, and the worst moment (start-up failure) is a 13px pill on the celebratory splash.

**Deterministic:** CLI detector: 3 findings, all in index.html, two false positives (the splash image fades in; the void colour is a deliberate literal), one advisory. Overlay: nothing on any state surface. axe: `aria-dialog-name` (serious) on both gates — `alertdialog` with no name though an h2 is there. The "page closed" in the capture was a harness timeout, not a crash: the read-only board had no objects to double-click — which is the finding.

## Overall Impression

This surface is where PRODUCT.md's one unacceptable failure would be felt, and it is felt: a board saved by a newer version looks empty — the data is safe on disk but gone on screen — and then silently throws away whatever the person does next.

## What's Working

1. The gates' copy: plain, blames nobody, says who to ask and what is lost.
2. Rule 7 holds on disk: a quarantined record is byte-identical after a session of edits; unknown types keep their place and can be moved, copied and deleted.
3. The visual system holds in both worlds: every text measured passes (danger on wash 6.4 / 5.7:1; placeholder hint 5.8 / 8.0:1), nothing below 12px.

## Priority Issues

**[P0] A read-only board looks empty and silently accepts work it will discard.** The quarantined load keeps the empty document (composition-root.ts:95–119), so 0 of 2 stored notes show under "Untitled board"; the dispatcher gets every capability, so notes can be made, typed, dragged and deleted — measured, then gone on reload, with no message. **Fix:** show what can be read (at least the board's name and what it holds) and never an empty board in its place; narrow capabilities to viewer so the rail and inspector say why they cannot act; keep the read-only state on screen (not dismissible); offer a way out and a way to keep the stored data (download). **Command:** /impeccable harden

**[P1] The gates are modal to the mouse only.** Both are `alertdialog aria-modal` with no name, no focus trap, no `inert` behind. On the deleted board focus stays on the body and Delete / Ctrl+D edit the board behind "This board was deleted"; 35 controls are reachable behind the password gate; a wrong password drops focus to the body with no `aria-invalid`; Escape does nothing and there is no way out of the password gate. **Fix:** name them, make everything behind `inert`, focus the one action, trap Tab; refocus the field on failure and wire the error to it; an "All boards" way out of the password gate. **Command:** /impeccable harden

**[P1] Start-up failures strand you on artwork or a spinner.** main.tsx throws before render, so `AppErrorBoundary` is never mounted; the splash stays up indefinitely with a pill ("Reloading may help") and nothing focusable. Home, with storage failing, shows "Looking for your boards…" forever. **Fix:** a quiet failure panel, sibling to the gates: plain cause (e.g. private browsing), "your boards on this device are unchanged", Reload and All boards; an error state for Home's list. **Command:** /impeccable harden, /impeccable clarify

**[P2] One alarm for three kinds of message.** `.of-notice` is danger-washed at its base, so "one placeholder, everything else fine" looks like "nothing will be saved"; the toast reuses it and stacks on it with no gap at 760; the copy leaks internals ("(newer-schema)", "object(s)", "room"). **Fix:** an advisory tier on the panel stock; red only for read-only and failures; a toast of its own; words for reason codes. **Command:** /impeccable clarify, /impeccable quieter

**[P2] The toast is unreadable in time and unclosable.** 5s, no pause on hover or focus (2.2.1); its close button is 8×15px with a 0px-wide icon — invisible (2.5.8). Dismissing the notice or toast drops focus to the body. **Fix:** a 24px close with a drawn ×; pause while hovered or focused; focus handed back. **Command:** /impeccable polish

## Persona Red Flags

**Jordan (first-timer):** opens their board after a version rollback, sees an empty "Untitled board" and "(newer-schema)", concludes the work is gone, rebuilds it on the live rail — and loses that too.

**Sam (keyboard/screen reader):** Tabs out of the password dialog into an unnamed page; edits a board announced as deleted; lands on the body after a wrong password; cannot reach the read-only explanation.

**The research lead on a shared board:** a colleague deletes the board mid-session; the notes are visible behind the scrim with no way to keep them, and the local copy is erased at the same moment.

## Minor Observations

- The unknown object shows its raw type id; the inspector does not appear for it and a double-click does nothing, silently.
- `FallbackView` says "No view registered"; `ObjectErrorBoundary` says "Could not display" + type — developer words, unreached by any path measured.
- The disabled "Open the board" reads as a secondary button, not a waiting primary.
- A stranded `.of-gone` comment block at styles.css:1452 and `.of-home__password` in the middle of the `.of-gone__*` family.
- `.of-fatal` has no tokens and no After Hours treatment.
- The read-only board's title sits ~6px higher than "All boards".

## Questions to Consider

- If rule 7 means "never write back what you could not read", why does the interface let people make things it knows it will never keep? Is read-only a different surface — a viewer — rather than a board with a banner?
- When a board disappears, is "leave" the only honest control, or should "keep a copy of what is on screen" always be offered?
- Should the brand splash ever carry bad news?
