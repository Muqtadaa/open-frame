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

**Stage 4 — boards you own. Free tier.**
An account becomes the way in, sharing MOVES a board rather than copying it,
and the board list earns the verbs a list of boards needs: rename, delete, pin,
and an order that is yours. Inserted 2026-09-19, ahead of the surface — see
below for why.

**Stage 5 — the surface.**
Comments, mentions, workspaces, follow-mode, live drag deltas.

## Done when

- Two people edit the same board simultaneously without conflict.
- Disconnection and reconnection lose nothing.
- Undo reverts _your_ change, not the most recent one.
- No Yjs type appears outside `packages/collab` — enforced in CI.

---

## Pick up here

**Current position: Stages 1, 2 and 3 are done and deployed.** Shared boards
and accounts are live; Stage 4 is planned below and not started. `openframe-rooms.muqdara95.workers.dev` holds one Durable Object per
board; the web app joins one when it is opened with `?room=<id>`.

Built, tested and on `main`:

- **`packages/collab`** — patch translation both ways, `CollabSession`, merge
  repair, the wire protocol, `BoardRoom`, and the client `RoomProvider` with
  backoff. 39 tests, none of which opens a socket.
- **`apps/rooms`** — the Worker and the Durable Object. Holds sockets, storage
  and the fact that any of this is Cloudflare; decides nothing.
- **The web app** — Share copies the board to a new unguessable id (Stage 4
  changes this to a move); the record line says whether the room is reachable
  and shows a face per person.
- **Identity** — email accounts, a board list that follows you between
  browsers, and links that carry a role: an editor key and a viewer key per
  board, enforced by the room rather than by the client.
- **Presence** — named cursors, dashed outlines for what others have selected,
  a solid one for what they have OPEN, and an advisory lock on inline editing.

Proved by `pnpm test:rooms`: two windows edit one board, undo reverts YOUR
change, a late joiner gets everything, and a board without a link joins no room.

---

## Stage 3 — identity

**Chosen as the next stage.** An account is for OWNERSHIP and board lists, not
for getting into a board: guests keep working exactly as they do now, and
signing in adds a name, a board list and the ability to own something.

### The open decision, and it blocks the schema

**Clerk or Supabase Auth.** The database is already Supabase, whose auth is free
on the same project, shares the user id with every row, and needs no second
integration. Clerk is the better standalone product and the more portable one.
The cost of the choice is mostly in the Worker: whichever issues the token is
the one whose keys the room has to verify.

### What it involves

1. **A Supabase project** (yours to create; free tier). Schema is small:
   `profiles`, `boards` (id, owner, title, timestamps), `board_members`
   (board, user, role). Row-level security from the start — a table without it
   is readable by anyone holding the anon key.
2. **Sign in, and staying signed out.** Anonymous use must not regress: the
   board you have today keeps working with no account and no network, which is
   PRODUCT.md's fourth principle and the thing a "sign in to continue" wall
   would quietly repeal.
3. **A board list.** The first second surface this app has had. Two routes is
   still below the threshold that earns a router — a query parameter and a
   conditional, and the deferred-decisions table stays as it is.
4. **Server-side authorization.** The Worker verifies the token and resolves
   membership BEFORE the room accepts the socket, which is why the check lives
   in the Worker rather than the Durable Object. The existing `Capabilities`
   interface is what it fills in; the client check stays a UX affordance.
5. **Presence gets real names.** A signed-in person shows their name and avatar;
   everyone else stays a guest with a creature name. The presence contract does
   not change — a name has never been an authorization and still is not.

### Folded in, by request

- **Follow-mode.** Viewport into presence, and clicking a face follows that
  person around the board. The channel already carries everything but the
  viewport. The trap is feedback: following someone who is following you is a
  loop, so a follower publishes that it is following and nobody follows a
  follower.
- **Live drag deltas.** Another person's note currently jumps when they let go,
  because nothing is written during a drag (rule 4, and it stays). The in-flight
  offset is presence, so the note slides without a single write, an undo entry
  or a storage row. Rendering it is the interesting part: the remote object must
  be drawn offset without the document moving underneath it.

### Still open, and named so it is not forgotten

- **The CRDT is not persisted locally**, only the document is. A board publishes
  into its room once per browser and the `Y.Doc` is rebuilt empty on every
  reload, so edits made offline AFTER the first session reach IndexedDB and the
  screen but never the room. Traced rather than reproduced. Fixing it also
  removes the resurrection hazard that the seed-once rule exists to avoid.
- **Remote objects are not schema-validated** as they arrive. Until Stage 3
  there was no untrusted peer; with accounts there is a boundary worth the name.
- ~~**A read-only participant goes deaf**~~ — fixed 2026-09-19. Originating a
  change asks `edit`; applying a merged one asks `view`, because those are
  different acts by different actors.
- **Link-only.** The per-board password is specified and unbuilt. It does not
  need accounts, so it can land before or after them.

---

## Stage 4 — boards you own

**Chosen 2026-09-19, ahead of follow-mode and live drag deltas.** Presence
polish on a surface people cannot navigate away from is the wrong order: the
dashboard is currently a dead end, and the board list cannot do the three
things a list of boards exists to do.

### The model changes, and PRODUCT.md changes with it

**An account becomes the way in.** Creating a board requires one; every board
has an owner; the dashboard has ONE kind of row. Guests keep opening a link
somebody sends them — that case is what the room's guest support was built for
and it survives untouched.

This rewrites principle 4. "A board works in one browser with no account and no
network" becomes **"a board works offline"**: IndexedDB and the CRDT already
provide that, and a signed-in person with no network keeps working exactly as
they do today. What is retired is *no account*, not *no network*.

PRODUCT.md is NOT edited yet, on purpose. The principle changes in the commit
that makes it true, because a document describing a product that does not exist
is worse than one describing an old one.

The owner took this on 2026-09-19, with the tension stated: principles 4 and 5
were recorded as live rather than resolved, and this resolves them in 5's
favour.

### The work, in order

Each step is shippable, and the order is by how broken the thing is.

1. **A way back.** There is no link from a board to the dashboard — none, in
   any component. You enter a board and the only exit is editing the URL. The
   board's name in the record line is the natural place for it.

2. **Sharing MOVES a board.** It copies today, leaving a stale duplicate that
   diverges silently — `share.ts` argues for that ("sharing should never be the
   act that takes your own board away from you") and the argument stops holding
   the moment every board has an owner and one row. The local original is
   removed once the shared one is written.

3. **Membership, so "shared with me" is real.** `board_members` has had RLS
   policies since the identity migration and **nothing has ever inserted a
   row**. Opening somebody's link makes you a guest in the ROOM, not a member
   of the BOARD, so a board shared with you never reaches your list. Opening a
   link while signed in should offer to add it.

4. **Manage boards from the list.** Rename in place, and delete. `deleteBoard`
   has been on the repository port and in both adapters since Phase 1 with
   **nothing calling it** — rule 21's failure mode, shipped. Only the owner may
   delete; a member removes themselves, which is a different verb.

5. **Delete reaches the room.** Destroying a board destroys the Durable
   Object's storage, so the links die with it. Needs a new authenticated Worker
   endpoint that verifies the editor key before destroying anything — the first
   destructive endpoint the room has, and it gets treated as one.

6. **Pins and recency.** Pinned boards first, then YOUR last-opened order, with
   "edited 4 minutes ago" shown as information rather than as the sort key.
   Today the list sorts by when a board last CHANGED, so somebody else's edit
   reorders your list. Both pins and last-opened follow a signed-in person
   between browsers, which is the promise sign-in already makes.

7. **Claiming what already exists.** On first sign-in, any board in this
   browser is offered for upload, once, with a list of what will move. Nothing
   is taken silently: uploading somebody's work to a server without asking is
   not a migration, it is a surprise.

### What this breaks, and what has to be re-decided

- **The front door's two handles.** "Start a board without an account" was
  chosen on 2026-09-19 and is retired by this. The door keeps one handle and
  the surface brief needs rewriting rather than quietly contradicting.
- **Guest creature-names** stay for people opening a link, and only for them.
- **The e2e suite** asserts local-first behaviour in several places — a board
  opened without a link joining no room, boards created with no account. Those
  assertions change meaning and must be rewritten deliberately, not deleted to
  get green.
- **`listAllBoards` merges two sources.** That merge goes away, which is most
  of the simplification this buys.

### Still open

- Whether a board can be moved BACK to local. Probably not worth it.
- What a member sees when an owner deletes a board they are looking at.

---

## Stage 5 — the surface

Comments, mentions, workspaces. Follow-mode and live drag deltas move here too:
both are real, both were folded in by request, and neither is worth doing while
the board list cannot rename, delete or order itself.

---

## Next

[Phase 5 · AI and MCP](phase-5-ai-and-mcp.md)
