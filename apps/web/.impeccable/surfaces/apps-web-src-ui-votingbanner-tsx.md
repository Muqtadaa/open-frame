---
version: 1
slug: "apps-web-src-ui-votingbanner-tsx"
primary_target: "apps/web/src/ui/VotingBanner.tsx"
related_targets: ["apps/web/src/canvas/VoteDots.tsx"]
---

THESIS: Dot voting is the room deciding together, so the board must say one
thing plainly at every moment: whether a round is open, how many dots you have
left, and — only when the round allows it — where everybody's dots went. The
banner holds the round; the dots belong on the notes.

MODE: Operate. Used in bursts by a whole room at once, often by people who
have never seen it before, and run by one facilitator who needs every control
within a press. Legibility of the round's state and of the armed tool outrank
expression.

PLACEMENT: setup, the running round and the results all live in one place, at
the top of the board under the navigation bar, in the notice's panel stock. It
is furniture: a selection's floating apparatus keeps clear of it. Below 520px
it docks from the rail's right edge to the gutter and is never translated over
notes.

THE ROUND: the title, "3 of 5 votes left" in mono, and how many people have
voted — never which notes. The dot tool has two modes side by side, Vote
("Voting" while pressed) and Take back; Alt-click also takes one back. Reveal
and Clear ask in the bar first, with the keyboard on the answer that acts.
Putting down the last vote puts the tool down and reads "All 5 votes placed".
A viewer reads "Voting open · view only".

DOTS: astride the note's top edge, clear of its text and of the reactions
along its bottom edge: up to five accent dots, then one dot and a count in
mono. While counts are hidden a person sees only their own.

RESULTS: ending a round opens them for everybody — they follow the round's
status, not one person's press. Ranked rows with a shared place for ties and
an ink wash for each share, each row selecting its note; "Select top 3". They
are the session's focal moment: the rows settle in at the ledger's stagger and
each wash is drawn out once its row lands.

KEYBOARD: the context menu's Dot voting submenu adds and removes votes on the
notes a round covers; with the tool up, Enter votes on the selected note and
Backspace takes a dot back. Focus never drops to the page through setup,
start, end, reopen and clear.

NOT: a badge on a note; a count shown while the round is hidden; a tool that
stays armed with no open round; a double-click or a right-click that votes; a
control that only a pointer can reach.

PHONE: below 520px the round is one line — the count ("3 of 5 left") and the
Vote switch — with a menu beside it holding Take back dots, Reveal, Results,
End, Reopen and Clear under the round's title and turnout (owner, 10-09). The
results do not open by themselves on End there.

FINISH: `dot-voting.spec.ts` holds the round's life from setup to clear, the
keyboard path, Take back, scope by frame, group and selection, the dots on the
corner and only new dots inked in; `e2e-rooms/dot-voting.spec.ts` holds two
people voting at once and a viewer refused; `phone-width.spec.ts` holds the
banner docked and one line; the "dot voting" golden holds its look in both worlds.
Critique 2026-10-07: 26/40. DESIGN.md: Dot Voting; Motion, The session.
