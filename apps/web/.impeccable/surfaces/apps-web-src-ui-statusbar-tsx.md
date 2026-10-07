---
version: 2
slug: "apps-web-src-ui-statusbar-tsx"
primary_target: "apps/web/src/ui/StatusBar.tsx"
related_targets: ["apps/web/src/ui/BoardTitle.tsx", "apps/web/src/ui/BoardMenu.tsx", "apps/web/src/ui/BoardExit.tsx", "apps/web/src/ui/safety-words.ts", "apps/web/src/ui/Session.tsx", "apps/web/src/ui/ShareControl.tsx", "apps/web/src/ui/Inbox.tsx", "apps/web/src/ui/AccountControl.tsx", "apps/web/src/ui/WorldSwitch.tsx", "apps/web/src/ui/use-squeeze.ts", "apps/web/src/ui/HistoryButtons.tsx", "apps/web/src/ui/ZoomControl.tsx"]
---

THESIS: The navigation bar is the page's masthead, in three zones: where you
are and whether it is safe; what the session is doing; who is here. The zoom
cluster is how the board is handled — undo, redo, the wheel, snap — and how
close you are. Both are reached for constantly and should never be the thing a
person is looking at. (Critique 2026-10-07, 23/40: eleven things in four box
styles on one row, two controls doing one job twice.)

MODE: Operate. Scanability of the name and the readout, keyboard reach, and
never trapping focus outrank expression.

ZONES: `<nav aria-label="Board">`, then three `role="group"`s —
"This board": exit, the name as the page's h1, the board's menu (⌄, outside the
heading), the safety readout, "N selected" only while something is.
"Session": one pill. "People": other people's faces, Share, Inbox, account.
The tab reads "<name> — OpenFrame". Nothing else is on the bar: no undo/redo
(zoom cluster), no theme (account sheet), no version history button (board
menu), no source link (the owner holds the copyright).

NAME: 15px sans 600 in full ink, taking the bar's free width up to 48ch; a name
that still does not fit is shown whole in its tip. Click to rename; Enter and
Escape hand focus back to it. Its floor is held by the HEADING, in the name's
own face, so the name can never run out of it over its neighbour.

BOARD MENU: Rename, Version history…; and After Hours only where accounts are
off. Absent when it would hold nothing but Rename.

SAFETY READOUT: "Saved" (local) / "Saved · Live" (shared, with a dot) /
"Offline · saved here" (room out of reach; the dot and tip say whether it is
reconnecting) / "Saving…" / "Not saved" / "Read-only". Only a failure is inked
(danger, 600) and announced. Offline is never hidden, only shortened.

SESSION PILL: "Session" at rest; "24:59 · ♪" while running. One sheet, Timer
then Music sections; Alt+T opens it at the timer. The listen prompt hangs from
it. Absent for a viewer until there is something to watch.

SHARE: a verb. Owner — both links and the password; anyone else — the link they
arrived on, copied, with the button saying so. Never a status.

INBOX: one count (unread mentions + agent changes still on the board), one sheet
with a section each; absent until there has been something.

ACCOUNT: quiet apparatus, never an outlined chip. Your name opens a sheet:
who you are, Sign out (never on the press), the theme as Notebook / After Hours.
Signed out, Sign in opens a sheet that carries the theme too.

ZOOM CLUSTER: undo, redo; a rule; "wheel: zoom" and snap; a rule; − slider + %
fit. The percentage refuses what it cannot take, with the reason. Below 480px
the wheel's word goes so the cluster keeps its gutter.

NARROW: measured, not breakpoints (use-squeeze.ts). In order, as far as it has
to: name; account → face; selection count; exit → arrow; readout → first word;
session and inbox words; running pill → time and note, inbox → count; Share →
link icon; tighter gaps, no rules; name to 6ch; last, an offline readout → its
dot, its word kept for the ear. Every control stays, inside the bar and clear of
its neighbours, at every width.

KEYBOARD AND NAMES: every tipped control names itself explicitly (tips.test);
every sheet takes the keyboard and hands it back; focus comes back after every
inline edit and after the last undo.

NOT: a toolbar of actions; a count of objects; a permanent "0 selected"; a chip
that is both a status and a button; your own face twice; two buttons for one
question; a control that only exists above some width.

FINISH: `navigation-bar.spec.ts` — the landmark, zones, the board menu and its
keyboard, the readout, the theme's home, the bar at its fullest at six widths
on a local and a shared board; `phone-width.spec.ts`; `session-timer.spec.ts`
and `session-music.spec.ts` — the pill; `comments.spec.ts` and the rooms
`agent-revert.spec.ts` — the inbox; `safety-words.test.ts`, `BoardMenu.test.tsx`,
`keymap.test.ts` (Alt+T); `design-tokens.test.ts` — what a short bar may hide;
`surfaces.visual.spec.ts` — the bar and cluster in both worlds.
