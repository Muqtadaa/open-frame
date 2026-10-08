---
version: 1
slug: "apps-web-src-ui-versionhistory-tsx"
primary_target: "apps/web/src/ui/VersionHistory.tsx"
related_targets: ["apps/web/src/ui/VersionPreviewBar.tsx"]
---

THESIS: Yesterday's board, got back without fear. Every version is a page you
can look at without changing anything, and restoring one never loses the board
it replaces — so the surface's job is to make looking cheap and restoring
safe.

MODE: Operate. Reached for rarely and often under stress, after a mistake that
undo cannot reach. Plain words about what will happen outrank everything else.

PLACEMENT: "Version history…" in the board's menu, on a local board (kept in
this browser) and on a shared one (kept by the room). A 320px sheet on paper,
hung below the menu or above it where there is no room.

THE SHEET: for an editor, a "Name this version" field and Save. Then the
versions, newest first, each a full-width row: its name, or its time — "14:05
today", "yesterday", "Wed, 7 Oct" — with the time under a name. A named
version has Delete, which asks once more as "Delete for good". Status lines
say "Loading versions", "No earlier versions yet." and "The versions could not
be reached."; a failure is an alert that names what failed.

THE PREVIEW: choosing a version shows it on the canvas, read-only, and the
navigation bar gives way to a bar of its own: "Viewing 14:05 today", "Restore
this version" for an editor, and "Back to now". Below 520px it wraps onto two
lines. Restore keeps the board as it is now as a version FIRST, and says so;
if that fails, nothing is restored and the toast says why. A restore is one
undo step.

KEYBOARD: the sheet takes the keyboard at the newest version, keeps Tab inside,
and hands it back to the board's menu on Escape. The preview's heading takes
the keyboard and is announced; Escape or "Back to now" says "Back to the board
as it is now" and puts the keyboard on the board. "Kept as …", "Deleted …" and
"Restored the version from …" are announced.

NOT: a restore that overwrites without keeping; a delete that takes one press;
an automatic version that can be deleted; a preview that can be edited.

STANDING: the list is not paginated, and borrows the mentions list's classes
(audit 2026-10-08, standing items).

FINISH: `history.spec.ts` holds previewing and going back unchanged, the
keyboard into and out of the preview, restore with undo, naming and deleting,
no Delete on an automatic version and Tab kept inside;
`e2e-rooms/history.spec.ts` holds the room's versions; `navigation-bar.spec.ts`
holds the menu opening it on paper in both worlds; `phone-width.spec.ts` holds
the bar wrapping. No golden shows it yet. Critique 2026-10-07: 25/40.
DESIGN.md: Version History. ADR 0019.
