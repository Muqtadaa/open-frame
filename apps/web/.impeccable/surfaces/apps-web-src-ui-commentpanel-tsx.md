---
version: 1
slug: "apps-web-src-ui-commentpanel-tsx"
primary_target: "apps/web/src/ui/CommentPanel.tsx"
related_targets: ["apps/web/src/canvas/CommentLayer.tsx", "apps/web/src/app/Comments.tsx", "apps/web/src/ui/Mentions.tsx", "apps/web/src/ui/MentionPicker.tsx", "apps/web/src/ui/Ago.tsx", "apps/web/src/canvas/PresenceLayer.tsx", "apps/web/src/ui/ShareControl.tsx", "apps/web/src/interaction/comment-drafts.ts"]
---

THESIS: The discussion beside the board and the people on it. A remark is
about a PLACE on the board and is read in the margin; presence says who is
here and what they are touching. Built for people who are not online at the
same time: every remark says when, and nothing anybody types is ever lost.

MODE: Operate. Keyboard reach, focus that comes back, and "is this still
live?" answered at a glance outrank expression.

WORDS ARE KEPT: a comment or reply left unposted — by Escape, Close, or a
click on another spot or pin — is kept per spot or thread and restored when it
is opened again ("Draft kept from before."). An unposted new comment stays on
the board as a dashed draft pin. Only posting clears a draft.

PINS: the pointed corner (bottom left) is the spot. Accent at rest, ink while
open — never the guide hue. Named "Comment from <who>: <what>", with
"(N messages)" when there are replies, counted as the pin's number counts.
Tips by data-tip, never title.

PANEL: at the gutter, under the navigation bar. New comment → the keyboard in
its box; a thread opened to read → at its heading (a kept reply → in the box);
"All comments" goes back to the list. Escape closes from anywhere in it; every
way out hands the keyboard back to what had it, or the comment tool. Each
remark: avatar (hidden from AT), name, how long ago in 12px mono with the exact
date in its tip. List rows: author · when · N replies · excerpt; opening one
brings its pin into view. Arrivals from others are announced politely.

KEYBOARD: M with a selection starts a comment at its top right; Cmd/Ctrl+Enter
posts. The mention menu is offered for every mention (a dismissal lasts for
that mention only), never offers you, and a chosen name's space is not doubled.

MENTIONS: the bell is a quiet chip at 30px in the UI face — accent wash and a
bold count while unread, outlined and muted once read. Its list is a labelled
sheet: focus goes in, arrows move, Escape or a press elsewhere closes and hands
focus back.

PRESENCE: a name rides every peer's cursor and selection; dashed for selected,
solid for editing. In the bar: 24px faces side by side (a pressable face
follows), three at most and "+N" for the rest, whoever you follow always shown.
Initials are page or panel colour on every hue.

NOT: a key or click that discards words; a remark without a time; a thread
you can only leave by closing everything; a solid accent bell; overlapped
faces under the target size; a pin pointing below its spot.

KNOWN: a remark cannot be edited or deleted; no next/previous thread; the
"Shared" chip copies the link you arrived on rather than opening the chooser;
a ghost face was seen once after a reload and not reproduced; the presence
layer on the canvas is not exposed to assistive tech.

FINISH: `comments.spec.ts` (drafts, keyboard, when/how many/where, reading a
thread, the marks, the small things), `e2e-rooms/live-comments.spec.ts`
(arrivals announced), `e2e-rooms/shared-board.spec.ts` (faces as targets and
the count), `design-tokens.test.ts` (face initials), `tips.test.ts`, and the
composer golden in both worlds.
