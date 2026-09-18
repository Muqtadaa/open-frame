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
| Room server  | Cloudflare Durable Objects ([ADR 0013](../adr/0013-collaboration-transport-durable-objects.md)) | 100k requests/day, 13k GB-s/day, 10 GB SQLite. Incoming WS messages bill **20:1**; outgoing are free | Workers Paid, $5/mo             |
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

**Current position: Stages 1 and 2 are built. Nothing is deployed yet.**

Two browser windows on the same link edit the same board, against a real
Durable Object, proved by `pnpm test:rooms` rather than by hand. Undo reverts
YOUR change and not the most recent one, a late joiner receives the whole board,
and a board opened without a link joins no room at all.

Built and on the branch:

- **`packages/collab`** — patch translation both ways, `CollabSession`, merge
  repair through the command layer, the wire protocol, `BoardRoom`, and the
  client `RoomProvider` with backoff and reconnection. 39 tests, none of which
  opens a socket.
- **`apps/rooms`** — the Worker and the Durable Object. Holds sockets, storage
  and the fact that any of this is Cloudflare; decides nothing.
- **The web app** — `?room=<id>` opens a shared board, a Share control copies
  the current board to a new unguessable id, and the status line says whether
  the room is reachable and who is in it.

Three rules keep the shape, and each has been broken once to watch it fail:
`yjs-lives-only-in-collab`, `cloudflare-lives-only-in-rooms`, and the boundary
that means the web app never names a Yjs type.

**What deploying needs, and it is two settings:**

1. **Merge.** `.github/workflows/deploy-rooms.yml` runs `wrangler deploy` on
   push to `main`, path-filtered so a stylesheet change cannot restart rooms
   people are editing in. It can also be run from the Actions tab. Nothing
   needs creating in Cloudflare first — the Worker is created by its first
   deploy, and the account already has a `workers.dev` subdomain.
2. **`VITE_COLLAB_URL` in Vercel**, once the Worker is up:
   `wss://openframe-rooms.<your-subdomain>.workers.dev`. Without it the build
   simply does not collaborate — the Share control is absent rather than
   broken — so the order is safe either way.

Add `CLOUDFLARE_ACCOUNT_ID` as a repository *variable* only if the deploy
complains that the token can see more than one account.

**Known and deliberate, in what is built:**

- **A board is published into its room exactly once per browser.** After that
  the room is the truth. A `Y.Doc` built fresh from IndexedDB carries no
  deletion history, so re-publishing local state would resurrect everything
  anyone else had deleted. Persisting the CRDT itself removes the asymmetry and
  is the first thing Stage 3 should do.
- **No presence cursors yet.** The channel is there and carries a guest name
  and colour; drawing other people's pointers is the next visible step.
- **Remote objects are not schema-validated** as they arrive, and a read-only
  participant would stop receiving changes rather than watching. Both were
  deferred deliberately and both belong with authorization in Stage 3.
- **Link-only, still.** The per-board password and the guest model are recorded
  above and not built.

**Stage 3, in order:** persist the CRDT locally, then presence cursors, then
identity — Supabase, the per-board password, and server-side authorization
through the existing `Capabilities` interface.

**Known traps, from the decisions already taken:**

- The sync handshake is symmetric. A client that only ANSWERS the room's step 1
  sits on an empty board forever; each step 1 asks for one direction of the
  diff. Written onto `BoardRoom.join`, because two tests failed exactly that way.
- Yjs updates cannot be concatenated. A snapshot and the updates after it are
  replayed one at a time — joining them into one buffer silently drops
  everything after the first, which is a board losing every edit since its last
  compaction, in production only.
- The observer must ignore what it wrote ITSELF, never "accept what is tagged
  remote": a remote change can arrive with any origin at all.
- A drag writes nothing until it commits, so a live drag is presence, not
  history. It is also why one storage write is one user action rather than one
  mouse move, which is what keeps the free tier's 100k writes/day comfortable.
- Text is a list of spans shaped like a `Y.Text` delta
  ([ADR 0012](../adr/0012-rich-text-as-spans.md)); a relation is an object and
  merges as an `add` ([ADR 0011](../adr/0011-relations-as-objects.md)).

---

## Next

[Phase 5 · AI and MCP](phase-5-ai-and-mcp.md)
