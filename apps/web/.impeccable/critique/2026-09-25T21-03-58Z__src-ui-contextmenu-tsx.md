---
target: "context menu, search, arrange bar, format bar (C3 #4)"
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/home/user/open-frame/apps/web/src/ui/ContextMenu.tsx"
target_fingerprint: "sha256:a8f99caa99aeaaad3ec1bccae84df3ddbb1ca7d213864a0233813a7bacba7077"
target_path: /home/user/open-frame/apps/web/src/ui/ContextMenu.tsx
timestamp: 2026-09-25T21-03-58Z
slug: src-ui-contextmenu-tsx
---
Method: dual-agent (A: design review · B: detector + browser measurements)

Target: C3 #4. Context menu (ui/ContextMenu.tsx), search (ui/SearchPanel.tsx), arrange bar (canvas/ArrangeBar.tsx) and format bar (views/FormatBar.tsx).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | A−/A+ step with no size shown (6×A+ reached 121.6px); a keyboard-focused menu item gets an outline but no bed |
| 2 | Match System / Real World | 3 | The product's own verbs ("Promote to evidence"); shortcut notation mixes words and glyphs ("Ctrl+⇧G") |
| 3 | User Control and Freedom | 2 | Escape silently discards a note's text and deletes a new note; Escape in the menu also clears the selection |
| 4 | Consistency and Standards | 2 | Menu hover is accent-soft, search hover is --of-hover; search uses 6px radius, not the 10px surface; menu shortcuts are sans, not DESIGN's mono |
| 5 | Error Prevention | 2 | Arrows nudge the object under an open menu; A+ has no upper bound |
| 6 | Recognition Rather Than Recall | 3 | Menu shows shortcuts; the search placeholder carries its grammar |
| 7 | Flexibility and Efficiency | 2 | No arrow or typeahead in the menu; the empty-canvas menu offers nothing usable; no search preview |
| 8 | Aesthetic and Minimalist Design | 2 | Empty canvas: 14 items, all disabled. Object menu: 16 flat rows, 561–699px tall, over the object |
| 9 | Error Recovery | 2 | A discarded edit gives no notice; "nothing found" offers no way forward |
| 10 | Help and Documentation | 2 | The query grammar lives only in a placeholder |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity Verdict

**LLM assessment.** Specific in materials, generic in behaviour.
- **Specific:** one shell, true letterforms on B/I/U, a mono type column in search results, and registry-driven "Derive/Promote" entries in the product's vocabulary.
- **Generic:** the context menu is a flat 16-row list that gives "Promote to evidence", the product's thesis, the same weight as "Bring forward".

**Deterministic scan.**
- `impeccable detect` on the five sources: 0 findings.
- In-page overlay:
  - 3 `text-overflow` hits on format buttons. False positives: the `[data-tip]::after` tooltip widens scrollWidth.
  - Out-of-scope hits: the grid ground (false positive) and a contrast misread on "Saved".
- axe on each open surface, in both worlds: 0 violations.
- The measurements confirm what the scans cannot see:
  - the search input has no focus indicator at all
  - the menu does not take focus and ignores arrows
  - Shift+F10 opens the menu at (8,8)
  - the format bar cannot be reached from the keyboard
  - focus drops to body after the menu, a search result and Tab in the editor
  - at 760px the arrange bar overlaps the record panel

**Visual overlays.** Injected in an automation tab only; none is open in the user's browser.

## Overall Impression

The four surfaces share a well-made shell. Two things hold them back: they are not a keyboard system, and the context menu has no hierarchy. The single worst moment sits next to them: Escape throws away a note somebody just typed.

## What's Working

1. **One contextual shell.** Page stock, hairline, 10px surface and contact shadow hold in both worlds.
2. **Registry-driven menu entries.** Derive and promote by intersection, in PRODUCT.md's language.
3. **Search by meaning.** `type:` filters work, the count is live, and Enter reveals and selects. Arrange disables distribute below three rather than hiding it.

## Priority Issues

**[P0] Escape silently discards typed text, and deletes a brand-new note.**
- **Why:** data loss with no notice and no undo. PRODUCT.md and rule 7 call losing work the one unacceptable failure, and canvas norms keep text on Escape.
- **Fix:** Escape commits and leaves editing. An empty new note may still be removed.
- **Command:** /impeccable harden

**[P1] The context menu is not a keyboard menu.**
- **What:**
  - Focus stays on body when it opens.
  - Arrows nudge the object underneath.
  - Shift+F10 opens it at (8,8), over the nav bar.
  - Escape returns focus to body and also clears the selection.
  - There is no roving tabindex or typeahead, and a focused item has no bed.
- **Fix:**
  - Focus the first enabled item on open.
  - Arrows, Home/End and typeahead.
  - A keyboard open anchors to the selection.
  - Escape closes only the menu and restores focus.
  - `:focus-visible` gets the same bed as hover.
- **Command:** /impeccable harden

**[P1] The context menu has no hierarchy.**
- **What:**
  - 16 flat rows and 7 groups.
  - It flips over the zoom cluster.
  - On empty canvas, 14 items that are all disabled.
- **Fix:**
  - Derive/Promote as the lead group.
  - Z-order in one "Arrange" submenu.
  - The empty canvas gets its own menu: Paste here, Select all, Add a note here, Zoom to fit.
  - Delete in danger on hover.
  - Shortcuts in mono.
- **Command:** /impeccable distill (+ bolder for the lead group)

**[P2] Search: focus, semantics, dismissal.**
- **What:**
  - `.of-search__input { outline: none }` leaves no indicator.
  - Results are buttons, not a listbox, and have no active descendant.
  - After Enter, focus goes to body.
  - Escape from a result keeps the query.
  - A click outside does not close it.
  - Radius and hover differ from the other surfaces.
  - `min-height` is declared twice.
- **Fix:**
  - A combobox/listbox with `aria-activedescendant`.
  - A focus-within ring on the panel.
  - Outside click closes; focus is restored.
  - "nothing found" suggests `type:` values.
  - Use `.of-surface`.
- **Command:** /impeccable harden (+ polish)

**[P2] The format bar is blind and out of the keyboard's reach.**
- **What:**
  - A± steps with no readout and no ceiling.
  - Tab from the editor commits and drops focus, so the bar is unreachable.
  - B/I/U tips omit Mod+B/I/U.
  - Strike and size have no shortcut.
- **Fix:**
  - A size readout between A− and A+.
  - Clamp the size.
  - Shortcuts in every tip.
  - A key (Alt+F10) that moves into the bar, with arrow navigation and Escape back to the text.
- **Command:** /impeccable clarify (+ harden)

## Persona Red Flags

**Alex (power user)**
- Can't drive the menu by keys, and arrows move the object under it.
- No arrange shortcuts.
- No search preview.
- The empty-canvas right-click is wasted.

**Sam (keyboard / screen reader)**
- No focus ring in search.
- Menu focus is not managed.
- Disabled items are skipped, so they are never announced.
- Focus lands on body after the menu and after search.
- The format bar is unreachable.

**Cross-functional researcher**
- Derive and Promote are buried in a drawing-tool list.
- The search grammar vanishes with the first keystroke.
- Escape eats a typed insight.

## Minor Observations

- **Disabled opacity:** 0.38 in the menu, 0.35 on icon buttons.
- **Arrange bar:** its six alignments want two groups of three. At 760px it overlaps the record panel.
- **Redundant descriptions:** on A−/A+ and on distribute.
- **Menu over the panel:** it opens over the record panel.
- **Hide:** says nothing about where hidden things go.
- **No "mixed" state:** for a partly bold selection.
- **Disabled menu text contrast:** 2.33:1 in Notebook. Exempt as inactive, but these items are also skipped by Tab.

## Questions to Consider

- If Promote and Derive are the product's thesis, should the arrange bar become a selection bar that leads with them?
- Should Escape ever throw away words in a tool whose one unacceptable failure is losing work?
- What should the board offer at a point in space, instead of a list of things you cannot do?
