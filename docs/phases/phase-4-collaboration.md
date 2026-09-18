# Phase 4 · Collaboration

**Status: In progress** · ← [Roadmap](README.md) · Design: [Collaboration](../architecture/09-collaboration.md)

---

## Why here and not earlier

Collaboration multiplies whatever exists. Multiplying a generic whiteboard
produces a generic whiteboard with more cursors. Multiplying a structured
research workspace produces something no competitor has.

It is also the phase that finally requires a server, accounts and hosting — three
things Phase 1–3 deliberately avoid so that development stays `pnpm dev`.

---

## What Phase 1 already did for this

| Decision                      | Why it mattered                                                 |
| ----------------------------- | --------------------------------------------------------------- |
| Flat object map               | CRDTs merge trees badly                                         |
| Fractional ordering           | A reorder is a one-object write that merges cleanly             |
| Nothing written during a drag | In-flight gestures are presence, not history                    |
| `origin` on every command     | Yjs `UndoManager` scopes undo by origin                         |
| `skipUndo` on dispatch        | Remote changes never enter local history                        |
| Deterministic cycle repair    | Concurrent reparenting is the one corruption LWW cannot prevent |
| Patches as our own format     | The adapter translates; CRDT types never reach the domain       |

All of these already exist and are tested. That is what makes this phase an
integration rather than a redesign.

---

## The stack, and what it costs

Decided at kickoff, on one constraint: **stay free at small scale.** OpenFrame
has no users and no revenue, so a fixed monthly cost before the first
collaborator is a cost with no counterparty.

| Piece        | Choice                                   | Free allowance                                                        | First bill                      |
| ------------ | ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------- |
| Room server  | Cloudflare Durable Objects ([ADR 0013](../adr/0013-collaboration-transport-durable-objects.md)) | 100k requests/day, 13k GB-s/day, 5 GB SQLite. A WS message bills as **1/20 of a request** | Workers Paid, $5/mo             |
| Database     | Neon Postgres                            | 0.5 GB, 100 CU-hours/month, scales to zero                            | Past 0.5 GB or 100 CU-hours     |
| Auth         | Clerk                                    | 50,000 monthly retained users                                         | $25/mo Pro                      |
| Assets       | Cloudflare R2                            | 10 GB, 1M writes, 10M reads, **zero egress**                          | $0.015/GB past 10 GB            |
| Web app      | Vercel                                   | Hobby                                                                 | Pro, $20/mo — see the flag below |

**Supabase was rejected for the database** despite a larger free tier, on one
line of its terms: a free project **pauses after 7 days of inactivity**.
`PRODUCT.md` says boards are "long and returned to, not one-shot… re-opened days
later". A database that sleeps through exactly that is the wrong shape, however
generous.

**Flag, for the day someone pays you:** Vercel's Hobby plan is non-commercial.
Nothing about the current deployment is wrong, but the first paying user makes
that a licence question, not a cost question.

Verified 2026-09-18. Re-verify at the point of signup — every one of these
numbers moved at least once in the last two years.

## Scope

**Infrastructure** — the first server. The transport is decided
([ADR 0013](../adr/0013-collaboration-transport-durable-objects.md)); auth,
database and asset storage stay
[deferred](../appendices/d-deferred-decisions.md) until the stage that actually
needs them, so that Stage 1 and Stage 2 need no account anywhere.

**Collaboration adapter** — `packages/collab`, quarantining Yjs behind a
`dependency-cruiser` rule identical in spirit to the one protecting the domain.
Patch ↔ Yjs translation both ways; invariant repair moved into the merge path.

**Presence** — cursors, selections, live drag deltas, viewport for follow-mode,
connected-user list. All awareness, none persisted.

**Authorization, for real** — every command re-authorized **server-side** through
the existing `Capabilities` interface. The client check remains a UX affordance.

**Product features** — comments, mentions, sharing and public links, board list
and workspaces.

---

## The two hard problems

**Migrating a live shared document.** Version-gate at the room level: a client
whose schema version is below the room's refuses to connect and prompts for
reload; migration runs once, server-side, on a room with zero connections.

**Collaborative undo semantics.** Origin-scoped is almost certainly right
technically. Whether undo should ever revert someone else's change is a
**product** question, and it stays open until there are users to ask.

---

## Stages, ordered so that spending starts as late as possible

The most valuable and most dangerous work needs **no infrastructure at all**.

**Stage 1 — `packages/collab`. No account, no server, no cost.**
Patch ↔ Yjs translation both ways, the `dependency-cruiser` rule quarantining
Yjs, and invariant repair moved into the merge path. Testable entirely
in-process with two `Y.Doc`s: if a test needs a socket, the seam is in the wrong
place. This is where three phases of merge-shaped decisions — the flat object
map, fractional ordering, nothing-written-during-a-drag, relations as objects,
text as spans — are cashed in or found wanting.

**Stage 2 — the room. Free tier.**
A Durable Object per board, the sync loop, presence. Rooms are reachable by link
and nothing more: no auth, no database, no board list. Two browser windows on
the same URL must edit the same board.

**Stage 3 — identity. Free tier.**
Clerk and Neon arrive together, because a board list needs owners and a
membership needs somewhere to live. Every command re-authorized server-side
through the existing `Capabilities` interface.

**Stage 4 — the surface.**
Comments, mentions, sharing links, workspaces.

## Done when

- Two people edit the same board simultaneously without conflict.
- Disconnection and reconnection lose nothing.
- Undo reverts _your_ change, not the most recent one.
- No Yjs type appears outside `packages/collab` — enforced in CI.

---

## Pick up here

**Current position: Stage 1 has not started. Nothing in this phase is built.**

Everything below is decided and needs no further discussion:

- The transport is Durable Objects, and the Yjs sync loop is written in this
  repo rather than taken from a wrapper — both wrappers are over a year stale
  ([ADR 0013](../adr/0013-collaboration-transport-durable-objects.md)).
- Hocuspocus is the named fallback. It is a week of work away because
  `packages/collab` is quarantined, so choosing wrong here is survivable.
- Stages 1 and 2 require no account with anyone.

**The next commit is the first half of Stage 1**, in this order:

1. `packages/collab` as a third workspace package, depending on `@openframe/core`
   and `yjs` and nothing else.
2. A `dependency-cruiser` rule forbidding `yjs` outside it — written, and then
   **broken once to watch it fail** (rule 23), because a rule that passes
   vacuously is worse than no rule and this one guards the phase's last "done
   when".
3. `Patch[] → Y.Doc` and `Y.Doc → Patch[]`, with a property test asserting the
   round trip over a generated document. The three `Patch` operations map onto a
   `Y.Map` of objects; the interesting cases are `set` with `value: undefined`
   (which deletes a key) and an `add` racing a `remove` of the same id.
4. Concurrent-reparent cycle repair moved from load-time into the merge path,
   with the existing deterministic repair reused rather than rewritten.

**Known traps, from the decisions already taken:**

- A drag writes nothing until it commits, so a live drag is **presence**, not
  document history. Do not let the Yjs adapter see it.
- `origin` is already on every command envelope and `skipUndo` already exists on
  dispatch. They were built for this. Use them rather than inventing a second
  mechanism.
- Text is a list of spans shaped deliberately like a `Y.Text` delta
  ([ADR 0012](../adr/0012-rich-text-as-spans.md)). The adapter maps one onto the
  other; it does not invent a third representation.
- A relation is an object, so it merges as an `add` like anything else
  ([ADR 0011](../adr/0011-relations-as-objects.md)). There is no edge table to
  reconcile.

**Before the first line of Stage 2**, re-verify the Cloudflare free-tier numbers
in the table above. They are the whole basis of the transport choice.

---

## Next

[Phase 5 · AI and MCP](phase-5-ai-and-mcp.md)
