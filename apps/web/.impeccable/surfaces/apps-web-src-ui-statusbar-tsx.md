---
version: 1
slug: "apps-web-src-ui-statusbar-tsx"
primary_target: "apps/web/src/ui/StatusBar.tsx"
related_targets: ["apps/web/src/ui/BoardTitle.tsx", "apps/web/src/ui/BoardExit.tsx", "apps/web/src/ui/ZoomControl.tsx", "apps/web/src/ui/AccountControl.tsx"]
---

THESIS: The navigation bar is the page's masthead: where you are, what has
happened to it, and that it is safe. The zoom cluster is how close you are,
plus the two settings for how the board is handled. Both are reached for
constantly and should never be the thing a person is looking at.

MODE: Operate. Scanability of the name and the save state, keyboard reach, and
never trapping focus outrank expression.

ORDER: exit, then the name as the page's h1; history; the record — save state,
and "N selected" only when there is a selection; a rule; the app's own
apparatus (share, mentions, account, theme); the AGPL source link last and
quietest. Marked `<nav aria-label="Board">`. The tab reads "<name> — OpenFrame".

NAME: 15px sans 600 in full ink, taking the bar's free width up to 48ch; a name
that still does not fit is shown whole in its tip. Click to rename; Enter and
Escape hand focus back to it.

SAVE STATE: "Saved" / "Saving…" / "Not saved" / "Read only", the where in its
tip. Only a failure is inked (danger, 600) and announced. It replaces the object
count and must never be removed: a local-first board's one reassurance.

ACCOUNT: quiet apparatus, never an outlined chip. Your name opens a sheet with
"Sign out" inside; nothing on the bar signs you out on a press.

ZOOM CLUSTER: "wheel: zoom" and snap (a square on points, never grid lines),
a rule, then − slider(read as %) + percentage fit. The percentage's tip says it
is for typing; while open, 50/100/200% sit above it for a pointer, and a zoom it
cannot take is refused with the reason — never silently clamped. A pressed
toggle carries a 1px accent ring as well as its wash.

KEYBOARD AND NAMES: every tipped control names itself explicitly (tips.test);
focus comes back after every inline edit and after the last undo; a focus the
interface hands back after a keyboard edit is the keyboard's, so Enter presses
it; a click still leaves Space to pan.

NARROW: the rail's 20px gutter at every width; below 640px the selection count
and the exit's words go, below 480px the save state's word and the rules;
nothing runs out of the bar.

NOT: a toolbar of actions (those live with the selection); a count of objects;
a permanent "0 selected"; an outlined sign-in louder than history; a readout
whose tip promises something its click does not do.

FINISH: `navigation-bar.spec.ts` holds the name and tab title, the landmark,
focus return, names, targets, the save state, the selection count, the order,
the account sheet, the zoom readout, the zoom cluster and narrow windows;
`adapters.test.ts` the save-state transitions; `tips.test.ts` explicit names;
`design-tokens.test.ts` the pressed toggle's ring; `surfaces.visual.spec.ts`
the bar and cluster in both worlds.
