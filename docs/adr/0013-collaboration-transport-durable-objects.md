# ADR 0013 · Cloudflare Durable Objects for the collaboration transport

**Status:** Accepted · 2026-09-18

## Context

[Phase 4](../phases/phase-4-collaboration.md) needs the first server. Three
things constrain what it can be.

**[ADR 0007](0007-collaboration-yjs-deferred.md) already chose Yjs** and shaped
three irreversible document decisions around it. It also recorded, on
2026-09-17, that `partykit` and `@y-sweet/sdk` had gone stale while
`y-websocket` and `@hocuspocus/server` were current — and said to re-verify at
adoption. This is adoption.

**The current host cannot do it.** The web app is on Vercel, which is
serverless: a function cannot hold a WebSocket open for the length of a
synthesis session. Wherever the room lives, it is somewhere new.

**Staying free at small scale is a requirement**, not a preference. OpenFrame
has no users and no revenue; a fixed monthly cost before the first collaborator
is a cost with no counterparty.

Re-verified on npm, 2026-09-18:

| Package                       | Version  | Last published |
| ----------------------------- | -------- | -------------- |
| `@hocuspocus/server`          | 4.7.0    | 9 days ago     |
| `y-websocket`                 | 3.1.0    | 6 weeks ago    |
| `yjs` / `lib0`                | 13.6.32 / 0.2.117 | current |
| `y-protocols`                 | 1.0.7    | 9 months ago   |
| `y-durableobjects`            | 1.0.5    | **13 months**  |
| `@mininjin/y-durable-objects` | 0.2.3    | **18 months**  |
| `partykit` / `@y-sweet/sdk`   | —        | **a year**     |

## Decision

**One Durable Object per board room, on Cloudflare's free tier, with the Yjs
sync loop written here rather than taken from a wrapper.**

A Durable Object is a single-threaded actor with its own storage, addressed by
name — which is exactly the shape of a collaboration room, and is the thing a
Node process has to be talked into being. WebSocket Hibernation means an idle
room holds no compute: a connection stops being "a process held open" and
becomes a row.

The sync loop is ours. Both Yjs-on-Durable-Objects wrappers are stale by more
than a year, which is precisely what ADR 0007 rejected `partykit` for, and
adopting one would put the least maintained thing in the stack at its centre.
What they wrap is small: the Yjs sync protocol is two message types over
`y-protocols/sync` and `y-protocols/awareness`, both of which sit on `lib0` and
are maintained. We write a few hundred lines against maintained primitives
instead of depending on an unmaintained few hundred.

### The free tier this rests on

Verified against Cloudflare's own docs, 2026-09-18:

| Durable Objects   | Workers Free       |
| ----------------- | ------------------ |
| Requests          | 100,000 / day      |
| Duration          | 13,000 GB-s / day  |
| SQLite storage    | 5 GB total         |
| Rows read         | 5 million / day    |
| Rows written      | 100,000 / day      |

**A WebSocket message bills as 1/20 of a request**, so 100,000 requests/day is
roughly two million messages a day. Hibernation means the duration budget is
spent only while a room is actually being edited. Going over moves the account
to Workers Paid at **$5/month**, which is the first bill this project will ever
have and is not due yet.

## Alternatives considered

**Hocuspocus on a small always-on box.** The strongest alternative, and the one
that would ship fastest: it is nine days fresh, and it already has the auth
hook, the persistence hook, awareness and webhooks that we will otherwise write.
Rejected on cost and on shape. Fly.io removed its free allowance for new
accounts, Render's free tier spins down — which ends a WebSocket — and Railway's
Hobby plan starts at $5/month. So it is roughly $5–7/month from the first day,
before anyone has collaborated. And a room is a stateful single-writer actor;
running one as a stateless Node process means bolting on the addressing,
lifecycle and storage that a Durable Object simply has.

It stays the fallback. If the hand-written sync loop turns out to be a mistake,
Hocuspocus is a week of work away, because the thing that would have to change —
`packages/collab` — is quarantined by design.

**`y-durableobjects`.** Would have given us the Durable Object shape without
writing the loop. Rejected because it was last published thirteen months ago:
taking it means the least maintained dependency sits at the centre of the one
thing the whole phase rests on, which is the mistake ADR 0007 wrote down.

**Liveblocks or another managed CRDT service.** Rejected on both counts: it
costs money at small scale, and it puts a vendor between the user and their own
document — which a local-first product whose licence promises the user their
source cannot honestly do.

**Cloudflare Workers without Durable Objects.** Rejected: a plain Worker is
stateless, so two people in the same room would not meet.

## Consequences

**We own the sync loop, and it must be tested without a network.** The protocol
is deterministic, so the tests are two `Y.Doc`s and a function — no server, no
sockets. If a test needs a socket, the seam is in the wrong place.

**Persistence is the room's, not Postgres's.** A Durable Object has 5 GB of
SQLite; the encoded Yjs update for a board is small. The database, when it
arrives, is for identity, membership and board lists — not for the document.

**Authorization lives in the Worker in front of the room.** The DO accepts a
connection only after the Worker has checked it, which is where the existing
`Capabilities` interface is re-applied server-side. A client-side check remains
a UX affordance and nothing more.

**No Yjs type may appear outside `packages/collab`** — the same
`dependency-cruiser` rule in spirit as the one protecting the domain, and the
thing that keeps this reversible.

**The bill starts at $5/month, and we will know why.** The free tier is a
concrete number of requests and GB-seconds, so exceeding it is a measurable
event with a cause, not a surprise.

## What this does not decide

- **Auth provider and database.** Separate decisions, taken when identity is
  actually needed (Stage 3), not now.
- **Whether rooms are regional.** Durable Objects have location hints; nobody
  has complained about latency because nobody has used it.
- **Collaborative undo semantics.** Still a product question, and still waiting
  for users, exactly as ADR 0007 left it.
