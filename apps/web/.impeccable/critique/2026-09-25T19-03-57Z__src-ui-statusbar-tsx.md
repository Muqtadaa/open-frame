---
target: the navigation bar (record line) and zoom cluster
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/open-frame/apps/web/src/ui/StatusBar.tsx"
target_fingerprint: "sha256:f8c7d1c7eaf4c337f7693c477521ed81d0cce11f7340dc12344b696946816d8a"
target_path: /home/user/open-frame/apps/web/src/ui/StatusBar.tsx
timestamp: 2026-09-25T19-03-57Z
slug: src-ui-statusbar-tsx
---
Method: dual-agent (A: design review · B: detector + browser measurements)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No save/sync state on a local-first autosave product; `document.title` is never set, so every tab reads "OpenFrame"; a truncated name has no reveal |
| 2 | Match System / Real World | 3 | "All boards" and "Undo Restyle 1 object" read well; "Source" means nothing to a researcher; the bare "zoom" word reads as the cluster's heading |
| 3 | User Control and Freedom | 3 | Escape cancels a rename and undo is labelled; the signed-in account chip signs out on one click |
| 4 | Consistency and Standards | 2 | The % tip says "Reset to 100%" but the click opens an editor; the snap `#` glyph is nearly the Frame tool's; "Sign in" is the only bordered control |
| 5 | Error Prevention | 2 | One-click sign-out; empty or over-long titles are safely refused |
| 6 | Recognition Rather Than Recall | 2 | The full board name is hidden (its tip says "Rename this board"); reset-zoom exists only as a shortcut |
| 7 | Flexibility and Efficiency | 3 | Ctrl + − 0 1 are claimed and the % is typeable; no zoom presets and no history list |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained and on the rule; "0 selected" is permanent, and two non-zoom settings live in the zoom cluster |
| 9 | Error Recovery | 2 | "abc" or "5000" in the zoom field silently reverts or clamps; a refused title silently reverts |
| 10 | Help and Documentation | 2 | Tips carry shortcuts, but nothing reaches a shortcut sheet or help |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment.** Mostly authored for this product, in a generic silhouette.
- **Specific:** the ledger rules between groups, tabular mono counts, the 44px bar on the 10px rule, the anchor exit that flushes the autosave before leaving, and a history control that follows the text caret.
- **Generic:** the whole bar is a floating white capsule with border and shadow, the same register as the zoom cluster and the rail, so it reads as "a toolbar" rather than the page's masthead.
- **The owner's ask partly landed.** The 15px/600 name is clearly the strongest type in the chrome. But the bar is a ~720px pill at top-left with ~500px of unused ground at 1280, and the name is capped at 22ch inside it.

**Deterministic scan.**
- `impeccable detect` on the six nav and zoom sources found 0 findings.
- The in-page overlay found 1, `codex-grid-background`, on the board canvas. That is a false positive: the ruled ground is the product's canvas, not decoration.
- axe-core scoped to the bar and the cluster, in both worlds: 0 violations.
- **The measurements found what the scanners could not.** They are folded into the issues below:
  - three buttons whose accessible names swallow the CSS tip text
  - a 28px theme toggle
  - a 15px-tall Source link
  - focus dropping to `<body>`
  - Enter/Space swallowed on a control last focused by the pointer

**Visual overlays.** The detector was injected in an automation tab only; no overlay is open in your browser.

## Overall Impression

A disciplined, well-measured bar that has not yet become the page's heading. The biggest opportunity is to treat the place group (exit + name) as a masthead and everything else as quieter trailing apparatus. Behind the visuals is a cluster of keyboard and assistive-tech defects the automated scans cannot see.

## What's Working

1. **History is honest and follows the caret.** While a field is being edited, undo drives that field's own history without stealing focus, and the tip names the action ("Undo Restyle 1 object"). It is status and control in one.
2. **The exit is a real link that saves first.** It flushes the autosave, then leaves; Cmd-click and "open in new tab" still work. It protects the one unacceptable failure (lost work) at the moment somebody leaves.
3. **Measured discipline.**
   - 30px targets; 12px floor everywhere.
   - Text contrast 6.2–15.6:1 (notebook) and 8.0–15.0:1 (After Hours).
   - One tip system, shown on keyboard focus as well as hover.
   - A 2px accent focus ring at 7:1 / 10.8:1.
   - No collisions with the rail, the record panel or the zoom cluster at 1280, 1024 or 760.

## Priority Issues

**[P1] The board's name is hidden while the bar's space goes unused.**
- **What:**
  - The name is capped at `max-width: 22ch` with ~500px free at 1280.
  - Its tip says "Rename this board", not the name.
  - `document.title` is never set.
  - The bar has no `header`/`nav` landmark and no `h1`.
- **Why it matters:** the core user returns days later with several boards open, and every tab, history entry and bookmark reads "OpenFrame".
- **Fix:**
  - Let the name flex into the free width, capped around 48ch.
  - Expose the full name when it truncates.
  - Set `document.title` to "<name> — OpenFrame".
  - Mark the bar `<nav aria-label="Board">` with the name as its heading.
- **Suggested command:** /impeccable harden (with typeset)

**[P1] Keyboard and screen-reader defects in the bar and cluster.**
- **What:**
  - Committing or cancelling the title or the zoom % unmounts the input, and focus falls to `<body>`. So does undoing the last step, which disables the focused button.
  - Enter/Space on a control last focused by the pointer are swallowed by the board keymap (the `pointerLed` gate in `use-keyboard-shortcuts.ts`): click zoom-in, press Enter, nothing happens.
  - Three buttons (title, Sign in, %) get the tip's `::after` text in their accessible name ("100% Reset to 100% (Ctrl0)").
  - The theme toggle is 28px wide (`.of-status > * { min-width: 0 }` beats the icon button's floor).
  - The Source link is 15px tall.
- **Why it matters:** these are WCAG 2.4.3 focus order, 4.1.2 name and 2.5.8 target size. PRODUCT.md commits to AA.
- **Fix:**
  - Hand focus back to the trigger after an edit ends.
  - Let an operable control that already has focus keep Enter/Space whoever focused it.
  - Give each tipped button an explicit `aria-label`.
  - Restore the 30px floor.
  - Give Source a 24px target.
- **Suggested command:** /impeccable harden

**[P1] The zoom percentage lies about what it does.**
- **What:**
  - Its tip says "Reset to 100% (Ctrl0)", but a click opens an editor.
  - Reset has no pointer route.
  - Invalid or out-of-range input silently reverts or clamps.
- **Why it matters:** the one control that names itself promises something it does not do, and a refusal gives no reason.
- **Fix:**
  - Tip "Type a zoom level · Ctrl0 for 100%".
  - A pointer route to 100% (presets, or double-click).
  - Say "Zoom is 5–1600%" when input is refused.
- **Suggested command:** /impeccable clarify

**[P2] What the bar carries, and in what order.**
- **What:**
  - "1 objects" is unpluralised.
  - "0 selected" stands permanently and repeats the record panel.
  - "Source", the bordered "Sign in" and the theme toggle run together after the last rule, with no grouping.
  - The signed-in account chip signs out on a single click (`AccountControl.tsx`).
  - Nothing says the board is saved.
- **Why it matters:** there are 5 kinds of thing on one bar, about 10 stops when shared. The most reassuring fact about a local-first board is the one that is missing.
- **Fix:**
  - Pluralise.
  - Show "N selected" only when N > 0.
  - Rule off the app group and set Source last and quietest (it must stay reachable).
  - Make the account chip open its sheet, with Sign out inside.
  - Consider a save state in place of the object count.
- **Suggested command:** /impeccable distill (with layout)

**[P2] The zoom cluster is not only zoom, and one icon collides with a tool.**
- **What:**
  - Wheel mode and snap are input preferences, not zoom.
  - "🖱 zoom" reads as the cluster's heading.
  - The snap `#` is nearly the Frame tool's glyph.
  - The wheel button's accessible name is a whole instruction sentence.
  - The cluster holds 7 operable controls, over the working-memory limit.
- **Fix:**
  - A distinct snap glyph.
  - Label the wheel "wheel: zoom", or move both toggles into a preferences disclosure beside the theme toggle, leaving − slider + % fit.
- **Suggested command:** /impeccable clarify (with distill)

## Persona Red Flags

**Alex (power user)**
- No pointer route to 100% and no zoom presets.
- Ctrl+= jumps from 100% to 200%.
- The counts are inert: they could select all, or frame the selection.
- Undo is one step at a time, with no history list.
- Clicking zoom-in and then pressing Enter does nothing.

**Sam (keyboard / screen reader)**
- Focus lost to `<body>` after every rename, zoom entry and final undo.
- No `nav` landmark or `h1`; only the rail announces a role.
- Tip text leaks into three buttons' names.
- Snap announces its state twice (`aria-pressed` plus "on" in the label).
- The Source link is 43×15.

**Returning cross-functional researcher**
- The tab reads "OpenFrame".
- The name is truncated with no way to read it.
- Nothing says the board is saved, or who changed what while they were away.
- "Source" reads as "data source?", a real risk for a research audience.

## Minor Observations

- **Stale comments.** `BoardTitle.tsx` and `styles.css` still describe the title as a mono specimen label. The account sheet comments still say "above the record line".
- **Tip shortcuts** render as "(CtrlZ)" with no separator. DESIGN.md calls for the shortcut in 12px mono in decade-rule grey.
- **Undo label casing:** "Undo Restyle 1 object" has a capital mid-sentence.
- **After Hours glyph** reads as a hat or lamp at 16px.
- **Shared class:** Sign in, Share and Account all use `.of-status__share`, so any change to one restyles all three.
- **Narrow widths.**
  - The 820px breakpoint hides "All boards" and the counts while ~230px is still free.
  - At ≤420px, Sign in and the theme toggle overflow the bar.
  - Under 820px the nav sits 12px from the edge while the rail stays at 20px.
- **Boundaries.** Disabled undo/redo icons are 1.7:1 (exempt as inactive). The pressed-state fill is 1.13:1 against the bar, so the icon ink carries the state alone.

## Questions to Consider

- If the name is the page's heading, why is it capped at 22ch inside a capsule with half the width empty? Is this a masthead or one more toolbar?
- Does "N objects" earn a permanent slot, or should that slot carry the local-first promise: "Saved · kept on this device"?
- Snap and wheel change how you handle the board, not how close you are to it. Would a pure zoom cluster, with preferences beside the theme toggle, make both corners tell the truth?
