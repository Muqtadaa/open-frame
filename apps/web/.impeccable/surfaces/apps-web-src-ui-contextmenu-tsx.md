---
version: 1
slug: "apps-web-src-ui-contextmenu-tsx"
primary_target: "apps/web/src/ui/ContextMenu.tsx"
related_targets: ["apps/web/src/ui/SearchPanel.tsx", "apps/web/src/canvas/ArrangeBar.tsx", "apps/web/src/views/FormatBar.tsx", "apps/web/src/views/RichTextEditor.tsx"]
---

THESIS: The four surfaces that appear for a moment and act on what you are
looking at: the context menu, search, the arrange bar and the format bar. Each
is summoned, answers, and leaves — and none of them may ever cost somebody the
words they were writing.

MODE: Operate. Keyboard reach, focus that comes back, and the product's own
verbs first outrank expression.

WORDS ARE KEPT: every way out of an editor commits — Escape, a click away,
Cmd/Ctrl+Enter, leaving the format bar for the board. Nothing throws an edit
away; undo takes it back. An edit that changed nothing commits nothing.

CONTEXT MENU: an ARIA menu. Focus moves in on open; arrows wrap, Home/End jump,
a letter jumps; Escape and Tab close the menu alone and hand focus back.
Unavailable items stay reachable (aria-disabled). Named by the label, the chord
in aria-keyshortcuts, one notation per platform (Ctrl+Shift+G or ⇧⌘G), set in
mono. A selection's menu leads with Derive and Promote, folds the stacking
order into "Arrange ›", and ends with Delete alone, danger when aimed at. Empty
board offers Paste here, Add a note here, Select all, Zoom to fit. From the
keyboard it hangs from the selection. Rows at the small target, so it hangs
straight down from the pointer on a laptop window.

SEARCH: a combobox over a listbox; the keyboard never leaves the box and
aria-activedescendant names the current result. The panel takes the focus
ring. A press elsewhere closes it; closing hands focus back. A result shows the
object's content beside the type column, never the type twice. Nothing found
suggests type:.

ARRANGE BAR: align across (three), a rule, align down (three), a rule,
distribute. Distribute below three is aria-disabled and says why.

FORMAT BAR: an ARIA toolbar. Alt+F10 in from the text, arrows along it, Escape
back with the selection it had; a keyboard press keeps the keyboard. A− ×n A+,
the readout the multiple of the object's own size from the stylesheet's
ladder, the ends switched off. Every tip names its shortcut; strike is
Mod+Shift+X, size Mod+Shift+> and <.

NOT: a key that discards; a flat list where Promote weighs what Bring forward
weighs; a menu of fourteen things you cannot do; a highlight only a mouse user
can see; a readout-less stepper; a disabled control whose reason nobody hears.

KNOWN: the arrange bar is on the chrome layer, which precedes the navigation
bar in the DOM, so it is first in tab order while it shows. At 760px it can
still sit over the record panel when neither fits beside the selection. A
partly bold selection shows "bold" as off, not mixed.

FINISH: `escape-keeps-words.spec.ts` (every editor, the no-op edit),
`context-menu.spec.ts` (keys, focus, Shift+F10, names, hierarchy, empty board),
`search.spec.ts` (combobox, ring, dismissal, focus return, content line),
`format-bar.spec.ts` (readout, ends, shortcuts, Alt+F10, leaving),
`arrange.spec.ts` (groups, reachable reason), `design-tokens.test.ts` (the
readout's ladder), `tips.test.ts`, `registry-contract.test.ts` (gists), and the
surface goldens in both worlds.
