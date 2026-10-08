---
version: 1
slug: "apps-web-src-views-pollview-tsx"
primary_target: "apps/web/src/views/PollView.tsx"
related_targets: []
---

THESIS: A poll is a question somebody asked, answered on the card itself. It
must read as a record of that question at every stage: open, answered by you,
held back, closed. The card is the result; nothing about answering it should
need explaining.

MODE: Operate. Answered in a few seconds by people mid-session, and asked by
one person who closes it. Each row is a control, and everything else on the
card is reading.

THE CARD: the slip's stock and corner, white by default, the question in
semibold. Each option is a row with a control edge that a press answers. Your
answer has a ring in the card's own ink and a drawn tick. The count and its
percentage sit in mono at the row's end, and the bar behind the words is that
option's share of the people who answered, as a wash of the card's ink so it
reads on any paper in either world. Underneath, in mono: "Closed", how many
have answered (always, results hidden or not), "results when closed" while they
are hidden, and a quiet "Close poll" / "Reopen" for the person who asked.

STATES: one answer each by default, and picking another moves it; several
answers and hidden results are record fields. While results are hidden each
person sees which row is theirs and nothing else. A closed poll's rows lose
their solid edges and read as a result. A viewer sees the counts, with the
rows switched off. A locked poll offers no Close.

EDITING: the options are a list in the record panel. A label commits when you
leave it; Add option and remove keep the poll between two and ten. An option
somebody has answered is fixed.

MOTION: an answer arriving slides the bar along at `--of-settle`, because the
bar is SCALED to its share rather than sized.

NOT: a form with a Submit; a percentage of all viewers rather than of the
people who answered; anyone but the asker closing it; a press between the rows
that answers anything.

STANDING: in landscape on a phone the docked record panel can cover the
poll's answers (audit 2026-10-08, standing items).

FINISH: `poll.spec.ts` holds placing, answering by pointer and keyboard,
editing options without moving answers, hidden results, closing by the asker
only, the closed look and your mark; `e2e-rooms/poll.spec.ts` holds two people
answering at once and a viewer refused; the "a poll" golden holds its look in
both worlds. Critique 2026-10-07: 26/40. DESIGN.md: Poll Card.
