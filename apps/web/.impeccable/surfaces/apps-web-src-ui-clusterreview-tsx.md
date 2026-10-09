---
version: 1
slug: "apps-web-src-ui-clusterreview-tsx"
primary_target: "apps/web/src/ui/ClusterReview.tsx"
related_targets: []
---

THESIS: Clustering hands a pile of notes to a machine and gets back a proposal,
not a change. The panel's whole job is honesty about that: what will be sent,
what came back, and what Apply will do, so nothing reaches the board that a
person did not read first.

MODE: Operate. Used rarely and deliberately, on a selection somebody has just
made, by a person who is about to send their team's words to a third party.

PLACEMENT: at the top of the board in the notice's panel stock, like dot
voting's setup, rising above the selection's apparatus while it is open. The
record panel steps aside. Below 520px it docks from the rail to the gutter.

STAGES, each with the keyboard on its first control:
1. Before anything is sent: the note count, and one line saying the notes'
   text goes to Anthropic. Cluster, Cancel.
2. While asking: "Clustering 12 notes…" as a status; Cancel stops it.
3. The proposal: the title and each theme's label are fields, each theme's
   summary and notes' gists below it, then "Other" with a count, and what
   Apply does — "Adds a frame with copies of 12 notes; the originals stay".
   The runs left today in mono. Apply, Discard.
4. A refusal: the plain fact ("AI needs an account", "No AI runs left today")
   and Close, with Sign in beside it when the account is what is missing.

APPLY: one frame holding a frame per theme, with copies of the notes, laid
beside the notes and never over them; one undo step; on a shared board an
agent-style change anybody can revert.

KEYBOARD: Tab stays inside while it is open. Escape closes it from anywhere
without touching the selection — except that the first Escape in a field only
leaves the field — and closes only the surface opened last.

NOT: a change written before it is reviewed; moving or editing the originals;
an error code for a refusal; a panel that leaves something behind on Discard.

FINISH: `ai-cluster.spec.ts` holds discard, the keyboard path, containment and
Escape, the signed-out and refused states, the copy line and the record panel
stepping aside; `app/ai-cluster.test.ts` holds one transaction with origin
`ai` that leaves the originals as they were. Goldens: `*-cluster-review` in
both worlds. The stages, keyboard and refusals live in `ui/ai-sheet.tsx`,
shared with Summarise with AI (ADR 0022), so a change to one is a change to
both. Critique 2026-10-07: 26/40. DESIGN.md: Cluster with AI. ADR 0018.
