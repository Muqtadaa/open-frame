# Parity matrix

← [Documentation index](../README.md) · [PRODUCT.md](../../PRODUCT.md) ·
[Current audit](../reviews/audit-2026-10-02.md)

OpenFrame set against Miro, FigJam, Excalidraw and tldraw: where it falls short
of what someone switching from one of them would expect, and where it is ahead.
Written for the audit's Sprint 5 (2026-10-02), to choose what comes after the
maintenance sprints.

**Read this as a map, not a backlog.** The audit is plain that features are not
to be built from a competitor's checklist. Each gap here is described as the
WORKFLOW somebody expects, so it can be judged against
[who OpenFrame is for](../../PRODUCT.md#users): people who arrive with research
that has outgrown a document, and whose board is "frequently the input to
something else".

**How true it is.**

- OpenFrame's column was read from the code on `main` at `a6c8ae1`
  (2026-10-05), and each entry names where it lives: under `apps/web/src`
  unless the path starts with `core/`, `collab/` (under `packages/`) or
  `apps/`. "Absent" means a search of
  `apps/`, `packages/`, `tools/` and `supabase/` found nothing.
- A competitor is credited with a feature only where a source is listed under
  [References](#references), checked on 2026-10-05. Where there is no source
  the entry says **unverified**. Competitors' plans and limits change; nothing
  here is meant as a claim about their pricing.

**The columns.**

- **Today:** what OpenFrame has.
- **Expected:** the workflow a switcher would reach for, and who has it.
- **Complexity:** S (days), M (a week or two), L (a phase), with the reason.
- **Semantic opportunity:** what OpenFrame's typed objects could do with it that
  a sticky-note board cannot. This is where a gap can become a lead.
- **Accessibility:** what it would ask of the commitments in
  [PRODUCT.md](../../PRODUCT.md#accessibility--inclusion).
- **Multiplayer:** what it would ask of the room and the command layer.

The tiers come from the audit:

- **Replacement-critical:** without it, someone cannot move their work here.
- **Workflow-important:** without it, the work is slower or needs a second tool.
- **Ecosystem breadth:** where the product sits among other tools.

---

## Replacement-critical

| Capability                                | Today                                                                                                                                                                                                                                                                                                                                                                                            | Expected                                                                                                                                                                                 | Complexity                                                                                                                                                  | Semantic opportunity                                                                                                                                                                                | Accessibility                                                                                                                | Multiplayer                                                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Take the board out** (image, PDF, data) | **Absent.** The only download is the raw record of a board that could not be read (`ui/download-copy.ts`). [PRODUCT.md](../../PRODUCT.md) lists export formats as explicitly undecided.                                                                                                                                                                                                          | Export a board or a frame as an image or PDF for a readout. Miro: PDF (one page per frame), JPG, SVG, CSV. FigJam: PNG, PDF. Excalidraw: PNG, SVG. tldraw: image export.                 | **M** for image/SVG of a frame (the renderer is DOM, so a raster needs a render path of its own); **S** for structured data, which the envelope already is. | The largest. A readout that keeps its provenance: each insight with the evidence it stands on, exported as data (CSV, Markdown) rather than as a picture of sticky notes. No neighbour can do that. | A PDF or image is not readable by a screen reader unless it carries text; a structured export is accessible by construction. | Read-only: an export is a snapshot of one client's document, so it needs no room changes.                                                                                                       |
| **Bring the material in**                 | Images only: picker, drop and paste (`canvas/use-image-drop.ts`). Text pasted onto the canvas is **absent**; text pastes only inside a field (`views/RichTextField.tsx`). CSV, JSON or another board's file: **absent**.                                                                                                                                                                         | Paste a column of notes and get notes; import a file of rows. Competitors' import paths are **unverified** here; Miro's CSV export is sourced.                                           | **S** for pasting plain text as notes, one per line; **M** for CSV with a column mapping.                                                                   | CSV rows become **evidence** with their `source`, `participant` and `tags` filled from columns, which is exactly the "raw material that has outgrown a document" PRODUCT.md describes.              | The mapping step is a form, so it must be keyboard-complete and announce what it created.                                    | One `CreateObjects` command per import keeps it one undo entry and one network message (rules 3 and 4). A large import is the 32 MiB message limit's first real test.                           |
| **Get yesterday's board back**            | **Absent** as history. Undo is local; agents' last 50 changes are logged and revertible (`collab/src/change-log.ts`, `ui/AgentChanges.tsx`). Nothing restores a person's work from before a bad edit.                                                                                                                                                                                            | Browse versions and restore one. Miro: snapshots hourly and at the end of a session, kept 90 days, restored as a separate board. FigJam: version history with a non-destructive restore. | **M–L**: the room would keep periodic `Y.Doc` snapshots in storage or R2, plus a way to list and open one read-only.                                        | A version of an evidence slip could say what changed in its record (source, status) rather than only that "something moved".                                                                        | A version list is a list; the board opened from one needs no new work if it opens read-only like a quarantined board.        | The hard one. Restoring into a live room races everyone in it; restoring as a **new board**, as Miro does, sidesteps that. Rule 7 applies: never write back a document that was not fully read. |
| **Copy between boards and apps**          | Copy and paste between objects use an **in-memory clipboard only** (`interaction/store/state.ts`); nothing reaches the system clipboard.                                                                                                                                                                                                                                                         | Copy from one board, paste into another or into a document. Excalidraw exports to the clipboard; the others are **unverified** here.                                                     | **S–M**: write the selection as the board's own JSON plus a plain-text form; read both back.                                                                | Copying evidence into a document as a quote with its source attached.                                                                                                                               | Clipboard actions need an announcement ("3 objects copied"), as none is made today.                                          | None: a paste is a `CreateObjects` like any other.                                                                                                                                              |
| **Understand a board without seeing it**  | Tab walks objects in reading order and each is announced (`canvas/BoardAnnouncer.tsx`); search by field (`ui/SearchPanel.tsx`); a board overview on Alt+S (`ui/BoardOverview.tsx`): counts by type, frames as a tree, and claims citing nothing, from `outlineBoard` in core. No spatial navigation between objects yet. See [the validation checklist](../reviews/device-and-sr-validation.md). | Miro documents a board summary for screen readers (Alt+S), spatial navigation between objects, and an accessibility checker.                                                             | **M**: a summary is a reading of the document the registry can already describe; spatial movement is a hit-test in a direction.                             | A summary can say what the board **means**: "12 evidence, 3 insights, 1 decision; 2 insights stand on no evidence", which no sticky board can.                                                      | This **is** the accessibility commitment. Today a screen-reader user can reach every object, but has no overview.            | None for a summary; it reads the local document.                                                                                                                                                |

## Workflow-important

| Capability                         | Today                                                                                                                                                                                                         | Expected                                                                       | Complexity                                                                 | Semantic opportunity                                                                                                               | Accessibility                                                                                                 | Multiplayer                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Start from a template**          | **Absent.**                                                                                                                                                                                                   | Miro: 300+ templates. FigJam: community templates.                             | **S** to load a board shape from a file; the work is in writing good ones. | A research template could be typed: an affinity map that expects evidence, a decision log that expects decisions.                  | Templates are boards, so no new surface; their content must pass the same contrast tests.                     | None: a template is a seed, like publishing a board.                                         |
| **Link out**                       | Rich text has four marks and **no links** (`domain/rich-text.ts`).                                                                                                                                            | **Unverified** for each competitor, but a link in a note is near-universal.    | **S–M**: a mark, plus link handling in the editor and the view.            | An evidence slip's `source` could be a link, so the trail leaves the board for the recording itself.                               | A link needs an accessible name and must be reachable from the canvas's keyboard model.                       | Content only; the security note is that links open with `noopener` and the CSP is untouched. |
| **Draw by hand**                   | **Absent**: the `draw` placement only drags out a box.                                                                                                                                                        | tldraw: pressure-sensitive drawing. Excalidraw: a hand-drawn style throughout. | **M**: a new object type (rule 5) with a path and a precise hit test.      | Little: ink is the least structured thing on a board, so it is the furthest from OpenFrame's thesis.                               | A drawing needs a text alternative, which is the gap images already have (alt text).                          | A stroke is one command on pointer-up (rule 4).                                              |
| **Present**                        | Follow somebody's viewport (`canvas/use-follow.ts`). A presentation mode is **absent**.                                                                                                                       | **Unverified** for each competitor.                                            | **M**: frames already exist to step through.                               | Step through the decisions, each with what it stands on.                                                                           | Focus and announcement must move with each step.                                                              | Follow already carries a viewport; presenting is everyone following one person.              |
| **Run the session**                | **Built.** Timer and music shared through the room, dot voting, polls, emoji reactions (`ui/SessionTimer.tsx`, `ui/SessionMusic.tsx`, `ui/VotingBanner.tsx`, `views/PollView.tsx`, `canvas/ReactionBar.tsx`). | FigJam: timer with music, voting sessions, stamps and emotes.                  | Parity.                                                                    | Votes and reactions land on typed objects, so "the most-voted insight and its evidence" is a question the board can answer.        | Listed for checking in [the validation checklist](../reviews/device-and-sr-validation.md#the-newer-surfaces). | Built on the room.                                                                           |
| **Let AI sort it**                 | **Built.** Cluster with AI, reviewed before it is applied, on the rooms server (`apps/rooms/src/ai/`, `ui/ClusterReview.tsx`). Summaries are **absent**.                                                      | FigJam: an AI co-pilot that clusters and summarises sticky notes.              | Summaries: **S–M** on the same route and quota.                            | A summary can be **of the evidence under an insight**, with citations back to it, rather than of whatever sticky notes are nearby. | The review step is the accessible part; it already exists.                                                    | An AI change goes through the change log like an agent's, and can be reverted by anyone.     |
| **Be told when something happens** | In-app only: the mentions bell and live comment announcements (`ui/Mentions.tsx`). Email and push are **absent**.                                                                                             | **Unverified** for each competitor.                                            | **M**: a sender and preferences, outside the room.                         | "An insight you wrote lost its last piece of evidence."                                                                            | Email is the most accessible channel there is.                                                                | Outside the room; Supabase already knows who is on a board.                                  |

## Ecosystem breadth

| Capability                     | Today                                                                                                                           | Expected                                                           | Note                                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Integrations**               | **Absent** (Slack, Jira, Notion, webhooks).                                                                                     | FigJam: Jira, Asana, Slack.                                        | A decision or task slip already has the fields a ticket needs (`types/task`, `types/decision`), so an integration here would carry meaning, not text.   |
| **Plug-ins and widgets**       | **Absent.**                                                                                                                     | FigJam: widgets. Excalidraw: shape libraries.                      | The registry is a plug-in seam in all but name; opening it to third parties is a trust decision first ([ADR 0016](../adr/0016-room-trust-boundary.md)). |
| **An API for other programs**  | MCP over stdio, 19 tools, with every board edit logged and revertible (`apps/mcp/src/tools/`). A public REST API is **absent**. | tldraw is an SDK; others' APIs are **unverified** here.            | **OpenFrame is ahead** on agents. Remote MCP is Phase 5a stage 5, gated on a threat model for a writer outside the browser.                             |
| **Embed a board elsewhere**    | **Refused, by decision**: `frame-ancestors 'none'` (decided 2026-10-03, `apps/web/src/app/deploy-config.test.ts`).              | Excalidraw and tldraw are commonly embedded (**unverified** here). | Reopening it means an embed mode with its own rules, not removing the header.                                                                           |
| **Sign in with work accounts** | Email and password through Supabase. SSO is **absent**.                                                                         | **Unverified** for each competitor.                                | Supabase supports OAuth and SAML; this is configuration and UI more than architecture.                                                                  |
| **Apps beyond the browser**    | Web only, with touch and pinch (`canvas/use-canvas-gestures.ts`). Desktop and mobile apps are **absent**.                       | **Unverified** for each competitor.                                | The checklist's touch pass is the place to learn whether the web is enough on a tablet.                                                                 |
| **Privacy from the server**    | The room relays and stores what editors send ([ADR 0016](../adr/0016-room-trust-boundary.md)); it is not encrypted end to end.  | Excalidraw: collaboration encrypted end to end.                    | Incompatible with server-side AI and agents on the same board as designed; a choice to make, not a gap to close.                                        |

---

## Where OpenFrame is ahead

Nothing in the references describes these in the neighbours. They are the
reason a switcher would come, so they are what a gap must not be closed at the
expense of.

- **Typed objects with provenance.** Evidence, insight, hypothesis, experiment,
  decision, task, journey stage and requirement, each with a record panel, and
  "stands on / cited by" in both directions (`ui/Provenance.tsx`). Promote a
  note, derive what stands on a cluster.
- **Search by field**, not only by text: `type:evidence`, `#pricing`
  (`core/src/domain/search.ts`).
- **Agents as accountable peers.** An agent edits through the same command
  layer as a person, and every board edit it makes is recorded and revertible by
  anyone on the board.
- **Local first.** A board opens and edits offline and merges on reconnect.
- **Accessibility under test.** Contrast pairs, reduced motion and the keyboard
  canvas are held by the build, not by review (CLAUDE.md rules 22 and 28).

## The top replacement-critical gaps, ranked

This is a recommendation for the user to decide on, not a decision.

1. **Take the board out.** The board "is frequently the input to something
   else" (PRODUCT.md), and today nothing leaves it. Start with the structured
   export, which is small and is the one no neighbour can match; an image of a
   frame next. It needs the export-formats question in PRODUCT.md answered first.
2. **Bring the material in.** Plain text pasted as notes is small; CSV into
   evidence is the semantic version of the same thing.
3. **Get yesterday's board back.** The largest of the five, and the one whose
   absence costs the most on the day it is needed. Restoring as a new board
   keeps it out of the live room's way.
4. **Understand a board without seeing it.** A board summary, and how big this
   is should be measured by the
   [device and screen-reader runs](../reviews/device-and-sr-validation.md)
   rather than guessed at.
5. **Copy between boards and apps.**

Against **remote MCP** (Phase 5a stage 5): it extends where OpenFrame already
leads, but it is gated on a threat model, whereas 1 and 2 have no such gate and
answer the question a switcher asks first: can I get my work in and out?

---

## References

Checked 2026-10-05. Features change; re-check before acting on a row.

- Miro, export: [How to export your board](https://help.miro.com/hc/en-us/articles/360017572754-How-to-export-your-board);
  [How to export a Miro board (ClickUp)](https://clickup.com/blog/how-to-export-from-miro/)
- Miro, templates: [Miro board overview (AFFiNE)](https://affine.pro/blog/miro-board)
- Miro, version history: [Board history: versions](https://help.miro.com/hc/en-us/articles/360021668819-Board-history-versions)
- Miro, assistive technology: [How to access Miro boards with assistive technologies](https://help.miro.com/hc/en-us/articles/4403828752274-How-to-access-Miro-boards-with-assistive-technologies);
  [Keyboard navigation while working on boards](https://help.miro.com/hc/en-us/articles/11997028019858-Keyboard-navigation-while-working-on-boards);
  [Overview of Miro Accessibility](https://help.miro.com/hc/en-us/articles/19506114302354-Overview-of-Miro-Accessibility)
- FigJam, facilitation and export: [Run meetings in FigJam](https://help.figma.com/hc/en-us/articles/8538436879767-Run-meetings-in-FigJam);
  [Run voting sessions in FigJam](https://help.figma.com/hc/en-us/articles/9359912208663-Run-voting-sessions-in-FigJam);
  [FigJam review (MakerStack)](https://makerstack.co/reviews/figjam-review/);
  [FigJam for designers (Hack Design)](https://www.hackdesign.org/toolkit/figjam/)
- FigJam, version history: [View a file's version history](https://help.figma.com/hc/en-us/articles/360038006754-View-a-file-s-version-history)
- Excalidraw: [excalidraw/excalidraw on GitHub](https://github.com/excalidraw/excalidraw);
  [Excalidraw+](https://plus.excalidraw.com/)
- tldraw: [tldraw on GitHub](https://github.com/tldraw/tldraw);
  [Collaboration (tldraw docs)](https://tldraw.dev/sdk-features/collaboration)
