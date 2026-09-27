---
version: 2
slug: "apps-web-src-ui-sharecontrol-tsx"
primary_target: "apps/web/src/ui/ShareControl.tsx"
related_targets: ["apps/web/src/app/share.ts", "apps/web/src/app/board-password.ts", "apps/web/src/controls/use-dismiss.ts"]
---

THESIS (REWRITTEN 2026-09-27, C3 #9): Every board is born in a room, so
sharing is not a moment but a record of who holds which link, and whether
they need a password. The whole risk of the feature is still sending the
wrong link, so the owner is always shown both, each saying what it gives
away, with the password beside them; nobody else is ever handed a link
silently.

MODE: Operate. A decision made in the middle of other work, and revisited.

THE OWNER'S CHIP opens the links sheet: copy edit link, copy view link, at
50px (`--of-hit-lg`) because this is the one control where missing costs
something, each with its consequence on the second line ("they can change the
board", "they can watch, and be seen watching"). A copied link keeps its name
and says "Copied" beneath — the word in place of the name did not say which.
Ownership is asked of the account once, when the chip mounts; until it
answers, the chip behaves as an editor's.

THE PASSWORD lives in the same sheet, under a rule below the links it
protects: a neutral "Set password", which refuses an empty value, and a
separate "Remove password". Whether one is set is known only to the room,
which does not yet say — logged, not faked.

ANYBODY ELSE'S CHIP copies the link they arrived on and names it: "Click to
copy the edit link" / "View link copied".

MOVING a board that lives only in this browser asks first, in the gates'
shell ("Move this board to share it?"), with the board INERT until the page
has left for the board that exists, and lands on that board with the links
sheet open. It used to move on the press and leave the old page editable,
saying "Saved" over edits that were then lost — rule 7's one unacceptable
failure. A failed move says so in the question and offers "Try again".

SHEET: panel white with the contact shadow, hanging below its control. It
takes the keyboard on arrival, closes on Escape, Done or a press elsewhere,
and gives the keyboard back to the chip (`useDismiss`, `useFocusOnOpen`).

VIEW-ONLY: a record, not a badge — 12px mono, muted, page stock, hairline,
apparatus radius, in the bar beside the other readouts.

EDGES: the Share and room triggers draw their boundary in the control border,
held at 3:1 by `design-tokens.test`.

FINISH: `share-confirm.spec` (the question, Escape, a failed move),
`share-owner.spec` (both links and the password; an editor's named copy),
`sheets-keyboard.spec`, and in `e2e-rooms` a real move after which what is
written is still there on reload. The room remains the authority; this
surface is never the thing being trusted.
