---
version: 1
slug: "apps-web-src-ui-peoplesheet-tsx"
primary_target: "apps/web/src/ui/PeopleSheet.tsx"
related_targets: ["apps/web/src/ui/FollowingBar.tsx"]
---

THESIS: Who else is here, and the one thing you can do about it: go where they
are looking. Faces name people, not colours, and following is always visible
and always one press from stopping.

MODE: Operate. Glanced at constantly, used occasionally — in a walkthrough,
when somebody says "look at this".

PLACEMENT: on a shared board only. The navigation bar's people zone shows the
OTHER people's faces (yours is the account), three at most, then "+N", which
opens a sheet listing everybody. The person you follow is always among the
three. Following is stated along the top of the board, under the bar.

THE SHEET: "People on this board", everybody, you first as "Ada (you)". Each
row is a face in the person's colour with their initial, the name, and a
state: a "Follow Ada" button, pressed while you follow them, or the reason they
cannot be followed ("Following someone", "No view to follow"). Choosing closes
the sheet.

THE BAR: an 8px dot in their colour, "Following Ada", and Stop, in the
notice's look. Below 520px it runs from the rail to the gutter. It goes when
you stop, when you move the board yourself, when they leave, or when they
follow somebody else.

KEYBOARD: a face is a pressed toggle with one name, "Follow Ada"; the state is
`aria-pressed`, never a second name. The sheet takes the keyboard at the first
person you can follow, keeps Tab inside, and hands it back to "+N".
"Following Ada" and "Stopped following Ada" are announced.

NOT: a colour chip with no name; a dead button for somebody who cannot be
followed; following that you cannot see or cannot stop; a face for yourself
beside your own account.

FINISH: `e2e-rooms/shared-board.spec.ts` holds counting everyone, faces as
side-by-side targets, following from the list behind the count, riding the
followed viewport and Stop, and refusing to follow somebody who is already
following; `scene/presence.test.ts` holds who can be followed. No golden shows
it yet. Critique 2026-10-07: 26/40. DESIGN.md: People and Following.
