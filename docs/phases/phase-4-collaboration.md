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

### Settled after shipping

Two things came back from production on 2026-09-19 and changed the model:

- **Opening a shared board keeps it, automatically.** Membership was OFFERED,
  on the reasoning that every link you ever clicked accumulating in your list
  is its own kind of mess. That was wrong about which mess is worse: not
  pressing the control left the board reachable only from the original message,
  while the local cache of it appeared in the list as "Untitled board" tagged
  `this browser` anyway — so the choice was a named row or a nameless one. The
  join is idempotent and grants nothing the key holder did not already have.
- **Guests cannot share.** A guest sharing a board produced one nobody owned:
  no row to list it from, no way to rename or delete it, and a local cache the
  board list could not tell from the cache of somebody else's link. Sharing now
  takes an account exactly as creating does, and the Share control is absent
  rather than refusing — but the room's status, the people on it and the
  view-only badge stay for everyone, guests included.

A cached copy of a board that lives in a room is never listed as a board "in
this browser", whatever is sitting in IndexedDB under its id.

### Still open, and named so it is not forgotten

- ~~**The CRDT is not persisted locally**~~ — fixed 2026-09-19, and the note
  above it was wrong. Reproducing it corrected the diagnosis: an `add` made
  from an empty `Y.Doc` is self-contained and always synced fine. A `set` did
  not. `applyPatchesToDoc` DROPS a `set` against an object the doc does not
  hold — correct across a network, where it means somebody deleted the object
  — and in the empty doc that every session after the first started with, that
  was every object on the board. So MOVING a note, recolouring it or rewriting
  its text wrote nothing into the CRDT. Online the window closed when the
  room's state arrived; offline it never did.

  The CRDT is now stored per board through a `CrdtStore` port, IndexedDB
  behind it. The `openframe:seeded:<board>` flag in localStorage is gone with
  it: seeding is a question about storage rather than a flag to maintain
  beside the thing it describes, and a persisted doc carries the deletion
  history that made the flag necessary. Proved end to end in `test:rooms` —
  a real browser edits a board with the socket refused, reloads, reconnects,
  and a second browser reads the move out of the room.
- ~~**Remote objects are not schema-validated**~~ — fixed 2026-09-19. Anyone
  holding a board's edit link could write arbitrary JSON into the shared map
  and it went straight into the document. `ApplyRemotePatches` now reads an
  arriving object through the registry — envelope, known type, current version,
  the type's own data schema — and a `set` is checked by APPLYING it and
  validating the result, because a patch says nothing about itself: only the
  object it lands on can say whether `frame.width: "wide"` is legal.

  Dropped, never repaired and never thrown. A half-understood object is worse
  than an absent one, and one bad object from one peer must not take down the
  sync loop for everybody — a batch keeps its good patches.
- ~~**A read-only participant goes deaf**~~ — fixed 2026-09-19. Originating a
  change asks `edit`; applying a merged one asks `view`, because those are
  different acts by different actors.
- **Link-only.** The per-board password is specified and unbuilt. It does not
  need accounts, so it can land before or after them.

---

## Stage 4 — boards you own

**Chosen 2026-09-19, ahead of follow-mode and live drag deltas. BUILT the same
day.** Presence polish on a surface people cannot navigate away from is the
wrong order: the dashboard was a dead end, and the board list could not do the
three things a list of boards exists to do.

All seven steps below shipped. What the plan did not anticipate is recorded
with them: a data-loss window under step 1, and a production bug under step 2
that no existing test could have caught.

### The model changes, and PRODUCT.md changes with it

**An account becomes the way in.** Creating a board requires one; every board
has an owner; the dashboard has ONE kind of row. Guests keep opening a link
somebody sends them — that case is what the room's guest support was built for
and it survives untouched.

This rewrites principle 4. "A board works in one browser with no account and no
network" becomes **"a board works offline"**: IndexedDB and the CRDT already
provide that, and a signed-in person with no network keeps working exactly as
they do today. What is retired is *no account*, not *no network*.

PRODUCT.md was edited in the commit that made it true, not before — a document
describing a product that does not exist is worse than one describing an old
one. Principle 4 now reads "a board works offline", and the note under it says
what was retired and why.

**A new board is a server board from the moment it exists.** Taken by the owner
on 2026-09-19, over two alternatives: staying local until shared (cheapest, but
keeps the two-row distinction) and a row-now-room-on-share hybrid (which would
list a board on your phone that opens empty). Only this one makes "follows you
between machines" true of the WORK rather than of the name. The cost is stated
in the interface rather than hidden: making a new board needs the network,
while every board you already have still opens and edits without one.

The owner took this on 2026-09-19, with the tension stated: principles 4 and 5
were recorded as live rather than resolved, and this resolves them in 5's
favour.

### The work, in order

Each step is shippable, and the order is by how broken the thing is.

1. **A way back.** DONE. An `All boards` exit at the head of the record line,
   as a real anchor so cmd-click still works.

   **It uncovered a data-loss window that was already there.** Autosave
   coalesces commands into one write 500ms later, and nothing ever closed that
   window: `dispose` CLEARED the pending timer rather than running it, and no
   unload handler existed. Hitting it used to mean closing the tab within half
   a second of typing; a one-click exit makes it ordinary. The runtime gained
   `flush()`, which the exit awaits, plus a best-effort `pagehide` flush for
   reload and tab-close. Breaking it per rule 23 produced an EMPTY board list,
   not a stale one — the board's first write had not landed either.

2. **Sharing MOVES a board.** DONE. Written into the room first, original
   removed second, autosave detached before the delete — it writes the whole
   document under the runtime's own id, so one keystroke would have put the
   original straight back.

   **And it found a production bug.** `claimUrl` handed `fetch` a `wss://` URL,
   which browsers reject before a packet moves, so every press of Share in
   production failed with "the room server could not be reached". One
   configured value cannot serve both `fetch` and `WebSocket` — each rejects
   the other's scheme. The room suite never caught it because its claim helper
   writes the URL out by hand: a test that reconstructs what it is checking
   cannot fail with it. The first test to press the real button found it
   immediately.

3. **Membership, so "shared with me" is real.** DONE, via `join_board()`:
   the LINK is the invitation, so redeeming it grants nothing its holder did
   not already have. An unknown board and a wrong key answer identically. An
   edit link upgrades a viewer; a view link never demotes an editor. Offered
   in the record line as "Keep this board" rather than taken on arrival.

4. **Manage boards from the list.** DONE. Rename writes the DOCUMENT as well
   as the row, because the listed title is a copy. Delete and leave are
   separate controls and never one. Confirmation happens in the row.

5. **Delete reaches the room.** DONE. `POST /room/:id/destroy`, editor key in
   the BODY rather than the URL. A legacy room refuses outright — it has no key
   to trust, and `roleForKey` deliberately admits everyone to those. A
   destroyed room keeps a tombstone, or "no keys" would make it a fresh room
   every old link opens with write access. Deleting runs in the OPPOSITE order
   to sharing: furthest thing first, so a failure leaves the board listed and
   openable rather than orphaned.

6. **Pins and recency.** DONE. `board_prefs` holds two facts per person per
   board. Every guard was probed against the real database in a rolled-back
   transaction: a stranger sees nothing and cannot pin, delete or leave; a
   member can leave but not delete.

7. **Claiming what already exists.** DONE. Every stray board named in the
   offer, moved one at a time, a failure on one not stopping the rest.

### What this broke, and how it was handled

- **The front door's two handles.** Retired. The surface brief was rewritten
  rather than left to contradict the page.
- **Guest creature-names** stay for people opening a link, and only for them.
- **The e2e suite** asserted local-first behaviour in several places. Those
  assertions were rewritten deliberately — "offers signing in and starting
  without an account" is now its exact inverse, with a note saying so, and the
  specs that needed rows in the ledger seed local boards directly rather than
  pressing a button that now needs an account. None was deleted to get green.
- **`listAllBoards` still merges two sources**, and will until the strays are
  gone: boards made before this change are still in people's browsers, and a
  build with no identity service has no account to require and keeps making
  local ones.

### Settled after shipping

Two things came back from production on 2026-09-19 and changed the model:

- **Opening a shared board keeps it, automatically.** Membership was OFFERED,
  on the reasoning that every link you ever clicked accumulating in your list
  is its own kind of mess. That was wrong about which mess is worse: not
  pressing the control left the board reachable only from the original message,
  while the local cache of it appeared in the list as "Untitled board" tagged
  `this browser` anyway — so the choice was a named row or a nameless one. The
  join is idempotent and grants nothing the key holder did not already have.
- **Guests cannot share.** A guest sharing a board produced one nobody owned:
  no row to list it from, no way to rename or delete it, and a local cache the
  board list could not tell from the cache of somebody else's link. Sharing now
  takes an account exactly as creating does, and the Share control is absent
  rather than refusing — but the room's status, the people on it and the
  view-only badge stay for everyone, guests included.

A cached copy of a board that lives in a room is never listed as a board "in
this browser", whatever is sitting in IndexedDB under its id.

### Still open

- **A board's list row cannot say whether it has a password.** That state lives
  in the room, not in the board row, so showing it would need a round trip per
  board. The control does not claim to know — but "which of my boards are
  protected?" has no answer in the interface yet.
- ~~A password is authorized by the EDITOR KEY, not by ownership.~~ Fixed. The
  room mints a THIRD key at claim — the owner key — kept in a column only the
  board's owner can read. Setting or changing the password requires it, and
  presenting it on the socket excuses its holder from being asked. A board that
  locks out the person whose board it is, on a new machine or after they have
  forgotten what they set, is a board they have lost.

  It is deliberately NOT a link. Accepted as `k` it would sit in the page URL,
  and a URL copied out of the address bar and passed on would carry the board's
  password with it — the one thing the password exists to prevent. It travels
  as `o` on the socket, and a test asserts it never reaches the page URL.

  What this is NOT is a verified identity. "Owner" means the holder of a key
  only the owner is ever handed, enforced by row-level security — the same
  trust model the other two keys rest on. Verifying a Supabase JWT in the room
  would be stricter and needs either JWKS or a Worker secret; that is a
  separate change, not a hidden gap in this one.

  Boards claimed before owner keys existed adopt one once, on the edit key —
  the strongest thing such a board has, and one that can already destroy it.
  `record_owner_key` writes only when the row has none and you own it; probed
  against the real database that a member cannot plant one and a second write
  is refused.

- **Two real rooms hold test data.** `brd_abcdefgh12345678` and
  `brd_aaaaaaaa11111111` are live Durable Objects that the e2e suite joined and
  wrote into on every CI run, because `apps/web/.env` is committed and points
  at the deployed worker. The suite is isolated now and a guard fails if that
  is undone, but the two rooms still hold what was already put there, and
  emptying them is a deliberate deletion of production data.

- Whether a board can be moved BACK to local. Probably not worth it.
- ~~Per-board password on a shared link.~~ Done. Enforced in the ROOM — a gate
  drawn in the browser is theatre, because the link key alone opens the socket.
  PBKDF2-SHA-256 at 100,000 iterations, chosen for a Durable Object rather than
  for an account credential: this is a second factor on a link that is already
  a 128-bit secret.

  One token per password rather than one per person, which is not a shortcut —
  a shared password cannot tell the people who know it apart, so per-person
  tokens would be per-person only in appearance. What it buys is the property
  that matters: changing or clearing the password mints a new token and every
  browser holding the old one is shut out at once, which is the entire reason
  to add a password to a link that has already gone somewhere it should not.

  Refused with close code 4003 rather than by refusing the upgrade, because a
  failed handshake reaches the browser as a generic 1006 and "your wifi
  blinked" is the wrong thing to tell somebody who needs to type a password.
- ~~What a member sees when an owner deletes a board they are looking at.~~
  Fixed. The provider treated 4004 as a dropped connection, so it reconnected
  into a room that answers 410, backed off and tried again for as long as the
  tab stayed open — the board just stopped responding, blaming nobody. The
  close CODE now decides: 4004 is terminal, everything else retries. The status
  gains `gone`, a scrim says the board was deleted and offers the way out, and
  it is deliberately not dismissible, because there is nothing left underneath
  it that can be saved.

  Autosave is disposed before the local copy is dropped, so nothing writes the
  document back on the next command or on `pagehide`.

  Rule 23 earned its keep twice here. The first e2e closed the socket on a
  timer and raced autosave, so it passed with the fix removed; the second
  asserted no phantom row appeared, which passed with the fix removed too —
  `listAllBoards` already drops room-board ids from "this browser", so that
  row could never have appeared. What the forgetting actually prevents is a
  dead board's document and CRDT sitting in IndexedDB forever, and that is
  what the test reads now.
- ~~**An owner cannot recover the view-only link after the moment of sharing.**~~
  Fixed. `my_boards()` returns a second `view_key`, populated for the owner and
  null for everybody else, and the row offers a copy control when it is there.
  Handing an owner both leaks nothing: they already hold the editor key, which
  is strictly the more powerful. The EDIT link is deliberately not offered in
  the list — opening the board is how you get it.

  The control is a third button on an owner's row, which made that row one
  button wider than a member's and pulled its tag out of the column; the
  actions block now has a fixed width. The alignment test asserted exactly
  that, two distinct x positions, before the fix.
- Boards shared before links had roles cannot have their rooms deleted, by
  design. The row goes; the room outlives it.

---

## Stage 5 — the surface

Comments, mentions, workspaces. Follow-mode and live drag deltas move here too:
both are real, both were folded in by request, and neither is worth doing while
the board list cannot rename, delete or order itself.

---

## Next

[Phase 5 · AI and MCP](phase-5-ai-and-mcp.md)
