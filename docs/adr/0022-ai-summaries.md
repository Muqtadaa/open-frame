# ADR 0022 · An AI summary is a text box that cites its notes

**Status:** Accepted · 2026-10-09. The owner chose the scope (a selection or a
frame), the output (a text box with a heading) and the citations (linked on
the board). Builds on ADR 0018 and answers its "a second AI feature arrives"
trigger.

## Context

Clustering (ADR 0018) sorts notes into themes. The other thing a facilitator
does at the end of a round is say what the wall amounts to: a few sentences
somebody who was not there can read. A model does that well too. Doing it
means deciding:

- **What is summarised.** The whole board is too much to send and rarely the
  question. A selection says exactly what was meant, and a frame is how a
  board already says "these belong together".
- **What the summary becomes.** A panel that disappears is lost the moment it
  closes, and a sticky note is too small for a title and several points.
- **Whether it can be checked.** A summary nobody can trace back to the notes
  is an unsupported claim. This product exists to keep claims standing on
  their evidence.
- **Whose allowance it spends.** ADR 0018 counts runs per person per day, and
  names a second feature as the moment to decide whether that is shared.

## Decision

1. **The same route checks as clustering, on its own path.** `POST
/ai/summary` on the rooms Worker runs the handler ADR 0018 built, now
   generalised over the feature: size, configured, bearer, body, Supabase
   sign-in, reserve, ask, validate, refund on failure, in that order. The
   Claude call is the same model, effort, fallbacks and stop-reason handling,
   with the summary's own system prompt, answer schema and a 4,000-token
   ceiling. The route never reads a room.
2. **One allowance across AI features.** Both features reserve against the
   same `AiQuotaObject` with the same limits. A person has 20 runs a day
   however they spend them, and the owner's global cap still bounds the bill.
   A quota per feature would quietly double the agreed spend each time a
   feature was added.
3. **A selection, or a frame and everything in it.** A selected frame stands
   for every note inside it, nested frames included, gathered with one
   `groupByParent` (rule 10). Its name is sent with the notes, so the summary
   can say what it is a summary of. Notes travel as refs, never ids, fenced
   and escaped as in clustering (one shared helper).
4. **The answer is a title and points, each citing refs.** At most 8 points.
   A ref the request never sent refuses the whole answer: a citation to a note
   that was not shown is a citation to nothing. A point that cites nothing is
   kept, since a fair conclusion across notes need not rest on one. Checked on
   the Worker and again in the browser (rule 8), from `@openframe/core/ai`.
5. **It becomes one text box beside what was summarised.** Rich text has no
   headings (ADR 0014), so the title is a bold, large paragraph and each point
   is a bullet. Placed by `placeDerived`, beside the frame or the selection.
6. **Each cited note is linked on the board.** One `cites` relation from the
   box to each distinct note a point rests on, in the same `CreateObjects`.
   The record panel's "stands on" lists them, and the Markdown export writes
   them under the box as `Cites:` (ADR 0020).
7. **Reviewed before anything is written.** The sheet says the text goes to
   Anthropic, then shows the title and each point editable, with the notes it
   cites beneath. Emptying a point takes it out. Apply is one change with
   `origin: 'ai'`: one undo step, and on a shared board a change anybody can
   revert from the Inbox.
8. **The two AI sheets are one component.** `ui/ai-sheet.tsx` holds the
   stages, Escape, focus, aborting and refusal copy; each feature supplies
   only its request and its review form.

## Consequences

- **No `derivations` entry for `text`.** A text box is not a claim type, so
  the overview does not start listing every text box as "citing nothing". A
  summary's citations are relations like any other, read wherever relations
  are.
- **Note text leaves for Anthropic**, exactly as for clustering, and the sheet
  says so before anything is sent. No new configuration: the same key,
  Supabase variables and limits switch both features on.
- **Clustering and summarising compete for one allowance.** Somebody who
  clusters 20 times cannot summarise that day. That is the point of a cap.

## When to revisit

- A summary is written without a person applying it.
- A third AI feature arrives whose runs cost very differently from these two,
  so one run no longer means roughly one unit of spend.
- People want a summary to stay in step with its notes as they change.
