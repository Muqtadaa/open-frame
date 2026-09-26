---
version: 1
slug: "apps-web-src-ui-boardlocked-tsx"
primary_target: "apps/web/src/ui/BoardLocked.tsx"
related_targets: ["apps/web/src/ui/Gate.tsx", "apps/web/src/ui/BoardGone.tsx", "apps/web/src/ui/BoardUnreadable.tsx", "apps/web/src/ui/StartFailed.tsx", "apps/web/src/ui/NoticeBanner.tsx", "apps/web/src/ui/Toast.tsx", "apps/web/src/views/UnknownView.tsx"]
---

THESIS: When a board cannot be used, or can only partly be used, say so
calmly, say that nothing was lost, and offer the one next step. Nothing here
may ever cost somebody their work, or look as if it had.

MODE: Operate. Plain words, keyboard reach and an honest way out outrank
expression.

GATES: one shell (Gate.tsx). It is a panel on the panel stock over the scrim:
a title that names the dialog, a paragraph that describes it, then actions.
The one thing to do comes first, then All boards. Everything behind is inert;
Tab wraps; the keyboard starts on the thing to do. None can be dismissed.
- Your board is safe: a quarantined board (rule 7). It gives the name, count
  and reason in words, and offers Download a copy of the stored record. No
  rail; the bar reads Read-only with the saved name.
- This board has a password: the field is never disabled. After a wrong
  password focus returns to it, with aria-invalid and the reason as its
  description. All boards is centred below.
- This board was deleted: Keep a copy saves the on-screen document under a
  new id as "<title> (copy)" and opens it.
- This board did not open / OpenFrame stopped: names refused storage,
  otherwise says the cause is not known. Your boards on this device are
  unchanged. Reload and All boards; the splash is not held.

MESSAGES: a notice is ADVICE (panel stock, ink); a toast is a FAILURE (the
danger wash, red text). They stack top centre with an 8px gap. The toast has a
24px drawn × and pauses while a pointer is over it or the keyboard is in it.
Dismissing either hands focus back. Counts in words, never codes.

PLACEHOLDERS: a type from a newer version is named in words, "From a newer
version of OpenFrame". Double-click says why it does not open (the
description's cannotEdit), never nothing.

NOT: an empty board standing in for an unreadable one; a code
("newer-schema") shown to a person; red for advice; a disabled field that
drops the keyboard; a gate the keyboard can walk out of; a loading screen that
has stopped being true.

FINISH: board-unreadable.spec.ts (sheet, no tools, download bytes, never
written), board-password.spec.ts (named, holds keyboard, wrong password, way
out), board-deleted.spec.ts (named, keep a copy), start-failed.spec.ts (both
routes), notices.spec.ts (tone, words, focus, toast target, pause, gap,
placeholder), adapters.test.ts (quarantine, capabilities), boards.test.ts
(keepCopy), readable-name.test.ts, and the surface goldens in both worlds.
