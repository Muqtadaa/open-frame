---
version: 1
slug: "apps-web-src-ui-summaryreview-tsx"
primary_target: "apps/web/src/ui/SummaryReview.tsx"
related_targets: ["apps/web/src/ui/ai-sheet.tsx"]
---

THESIS: A summary is a claim about what a set of notes says, made by a
machine. The sheet's job is to make that claim checkable before it exists:
what is sent, what came back, which notes each point rests on, and what Apply
will write, so nothing reaches the board that a person did not read first.

MODE: Operate. Used deliberately at the end of a round, on a selection or a
frame somebody has just chosen, by a person about to send their team's words
to a third party.

PLACEMENT: the AI sheet — the same component and place as Cluster with AI
(`ui/ai-sheet.tsx`), at the top of the board in the notice's panel stock,
rising above the selection's apparatus. The record panel steps aside. Opening
one AI sheet closes the other.

STAGES, each with the keyboard on its first control:
1. Before anything is sent: the note count, and the line saying the notes'
   text goes to Anthropic. Summarise, Cancel.
2. While asking: "Summarising 12 notes…" as a status, naming the frame when
   there is one; Cancel stops it.
3. The summary: the title as a field; each point a two-line field headed
   "Point N · cites K notes" with those notes' gists beneath; then what Apply
   does — "Adds a text box citing 5 notes; nothing summarised changes". Runs
   left today in mono. Apply, Discard. An emptied point is taken out.
4. A refusal: the plain fact and Close, with Sign in when the account is
   missing.

APPLY: one text box beside what was summarised, never over it — the title a
bold large line, each point a bullet — and a `cites` relation to each note a
point rests on. One undo step; on a shared board a change anybody can revert.

KEYBOARD: as Cluster with AI. Tab stays inside; Escape closes from anywhere
without touching the selection, except that the first Escape in a field only
leaves it; Enter in the title applies, Enter in a point is a new line.

NOT: a change written before it is reviewed; a point citing a note the
person cannot see in the sheet; touching the notes summarised; a second copy
of the sheet's stages beside the cluster sheet's.

FINISH: `ai-summary.spec.ts` holds selection and frame, editing, Discard,
the keyboard path, signed out, a refusal and the export's citations;
`SummaryReview.test.tsx` holds asking once and the emptied point;
`app/ai-summary.test.ts` holds frame expansion and one transaction. Goldens:
`*-summary-review` in both worlds. DESIGN.md: Summarise with AI. ADR 0022.
