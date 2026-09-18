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
| Database     | Supabase Postgres                        | 500 MB database, 10 GB bandwidth/month                                | Pro, $25/mo                     |
| Auth         | Clerk                                    | 50,000 monthly retained users                                         | $25/mo Pro                      |
| Assets       | Cloudflare R2                            | 10 GB, 1M writes, 10M reads, **zero egress**                          | $0.015/GB past 10 GB            |
| Web app      | Vercel                                   | Hobby                                                                 | Pro, $20/mo — see the flag below |

**Supabase is the database, with the pause accepted as a known cost.** A free
project is paused after 7 days of low activity, which reads badly against
`PRODUCT.md` — boards are "long and returned to, not one-shot… re-opened days
later". Three things make it survivable, and they are the reason it is written
down rather than left as a surprise:

- The threshold is **activity, not traffic**: "typically a few user requests to
  the database each day over the previous week is enough". A daily health check
  costs nothing and is worth having regardless.
- A warning email arrives roughly a week before the pause, and a paused project
  is restorable for 90 days.
- **Nothing on a board lives in Postgres.** The document is in the room's
  Durable Object ([ADR 0013](../adr/0013-collaboration-transport-durable-objects.md));
  the database holds identity, membership and board lists. A pause blocks
  sign-in and the board list, which is bad — it does not touch anyone's work.

If the pause becomes a real problem, Pro is $25/month and the decision reverses
by paying, not by migrating.

**Open, and not decided here: whether Clerk survives this.** Supabase ships auth
on the same free project, and auth that already knows the database is one less
integration and one less set of user ids to reconcile. Clerk is the better
standalone product. This is a Stage 3 question with nothing riding on it until
then, so it stays open rather than being settled as a side effect of choosing a
database.

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
Auth and the database arrive together, because a board list needs owners and a
membership needs somewhere to live. Supabase is the database; whether it is also
the auth provider is the open question above. Every command re-authorized server-side
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

**Current position: Stage 1 is done. Stage 2 is the next thing, and it is the
first that needs an account anywhere.**

Built and on `main`:

- `packages/collab`, depending on `@openframe/core` and `yjs` and nothing else,
  with `yjs-lives-only-in-collab` in `.dependency-cruiser.cjs` — broken once
  against `apps/web` to watch it fail.
- **Both directions of the translation.** `Patch[] → Y.Doc`, and `Y.Doc →
  Patch[]` from a `Y.Map` change event.
- **`CollabSession`**, binding a `Y.Doc` to the `CommandDispatcher` both ways
  with no transport at all. Two clients, joined by their update streams and
  nothing else, converge on the same `BoardDocument`.
- **Merge repair**, through the command layer: `parentageRepairs` in core is the
  one implementation of "which member of a cycle gets detached", shared by the
  load-time path and the merge path, and `RepairParentage` is the command that
  applies it. It ignores locks on purpose — a repair that can be refused is not
  a repair.
- **`ApplyRemotePatches`**, the one command that carries patches rather than
  intent, refused unless `origin` is `remote`.

Everything below is decided and needs no further discussion:

- The transport is Durable Objects, and the Yjs sync loop is written in this
  repo rather than taken from a wrapper — both wrappers are over a year stale
  ([ADR 0013](../adr/0013-collaboration-transport-durable-objects.md)).
- Hocuspocus is the named fallback. It is a week of work away because
  `packages/collab` is quarantined, so choosing wrong here is survivable.
- The database is Supabase, its 7-day idle pause knowingly accepted. Nothing
  needs it before Stage 3.

**Two things Stage 1 deliberately left for Stage 2 to decide.** Both are written
here rather than solved early, because solving them now means guessing at a
transport that does not exist:

1. **Whether remote objects are validated as they arrive.** `ApplyRemotePatches`
   filters patches it cannot apply; it does not check that an incoming object is
   a valid one of its type. Today nothing untrusted can reach it — Stage 1 has
   no peers. The moment a socket exists, another client IS an untrusted
   boundary, and rule 8 applies. The registry already exposes `validate` per
   type, so the cost is small; the question is what to do with a failure, which
   is the same question as the next one.
2. **What a client does when a merged change will not apply.** `CollabSession`
   takes a required `onError` precisely so this cannot be defaulted quietly. A
   read-only participant is the case that forces the answer: `dispatch` refuses
   an edit they are not allowed to make, so today they would stop seeing other
   people's changes entirely. That wants solving with authorization in Stage 3,
   not patched around in Stage 2.

**Stage 2, in order:**

1. **A Worker and a Durable Object per board**, reachable by link. No auth, no
   database, no board list.
2. **The sync loop** — `y-protocols` sync and awareness over a WebSocket, with
   Hibernation so an idle room costs nothing. This is the part no wrapper is
   supplying, and it is two message types.
3. **Presence**: cursors, selections, live drag deltas, viewport for follow-mode.
   All awareness, never persisted — a drag writes nothing until it commits, so a
   live drag is presence and the `Y.Doc` must never see it.
4. **Two browser windows on the same URL editing the same board.** That is the
   whole of "done" for the stage.

**Known traps, from the decisions already taken:**

- The observer must ignore what it wrote ITSELF, never "accept what is tagged
  remote" — a remote change can arrive with any origin at all. Inverting that
  fails loudly; omitting it does not, which is why
  `ignores its own writes coming back out of the document` exists.
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
