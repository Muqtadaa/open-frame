# ADR 0016 · The room enforces who may write, not what they write

**Status:** Accepted · 2026-10-03 · makes explicit what ADR 0013 built; closes
review item A-5 (`docs/reviews/tracks-ab-mcp.md`)

## Context

A board's room is a Durable Object holding the board's Yjs document
(ADR 0013). Peers send it binary sync messages:

- **A viewer's** document updates are dropped before they are read
  (`packages/collab/src/protocol.ts:196-201`).
- **An editor's** updates are applied with `Y.applyUpdate`, relayed verbatim to
  every other peer and persisted (`room.ts:137-147`, `room-object.ts` `#persist`).
- **Nothing in the room inspects what an update contains.**

Compliant clients defend themselves. Every remote object goes through
`readRemoteObject` before it reaches the domain
(`packages/core/src/commands/handlers/remote-object.ts:32-69`). It checks:

- the envelope;
- that the type is registered;
- that the data version is current;
- the type's own `validate`;
- `sanitizeStyle`.

An object that fails is **dropped**: it never reaches the domain, the
renderer, the undo stack or the domain document that autosave writes. It does
reach the browser's raw CRDT cache, because `connectBoard` saves the whole
`Y.Doc` (`packages/collab/src/connect.ts:156`) before the command layer filters
anything.

This was a choice, but nobody had written it down, so the review asked for it
to be (item A-5). It matters more now than when the room was built, for two
reasons:

- an agent can write through the same room;
- remote MCP transport (Phase 5a stage 5) would put that agent on the network.

## Decision

**The room is transport-authoritative and schema-agnostic.**

- **It is the authority on WHO may write.** Only the editor link changes the
  document, and only the owner key destroys it or sets its password. That gate
  is the only one that binds a modified client, which is why it lives in the
  room.
- **It does not decide WHAT may be written.** Any update that decodes as Yjs is
  accepted from an editor, relayed and stored. Deciding what a valid board is
  belongs to the domain (`packages/core`), and every client that reads the
  board applies it.

### What this means, stated plainly

1. **An editor with a modified client can persist anything that decodes as a
   Yjs update.** This includes objects no current client accepts and values in
   the board's `meta` map. It also includes very large documents: one message
   is capped at the platform's 32 MiB (see Hardening), but nothing caps how
   many arrive.
2. **Compliant clients drop what they cannot read, and do not quarantine it.**
   - The bad object stays in the shared `Y.Doc`, in room storage and in every
     participating browser's CRDT cache, so it is served to every peer and
     every cold start, and reloaded from each browser on its next session.
   - Every peer drops it again, so nobody sees it and nobody can edit it away.
   - A `meta` patch is held to the same rule: since 2026-10-03 only a title
     that `SetBoardTitle` would accept is applied (`remote-meta.ts`). See
     Hardening.
3. **Persistence may hold data no current client accepts.** It has always been
   possible after a schema change: an object written by a newer client is
   dropped by an older one. This decision does not make it worse, and
   quarantine on the load path (`schema/deserialize.ts`) still protects local
   documents.
4. **Recovery is manual.**
   - The room keeps a compacted snapshot plus up to 64 loose updates
     (`COMPACT_AFTER`).
   - There is no reseed tool today. Restoring a board means replaying a known
     good copy into a new room: any participant's local copy, or the owner's
     "keep a copy".
   - A reseed tool is to be built **when it is first needed**, not before.
5. **Who can do this:** only a holder of the editor link. A viewer, a stranger
   or a former holder of a rotated password token cannot.

## Alternatives considered

- **Validate every update in the room against the domain schema.** Rejected
  for now:
  - The room would have to decode each Yjs update into OpenFrame objects. That
    means running `packages/core` and the type registry inside the Durable
    Object for every keystroke from every editor, on the hot path that ADR 0013
    chose Durable Objects to keep cheap.
  - A Yjs update is a delta, not an object. Validating it means applying it to
    a copy of the document and reading the result back on every message.
  - It would also make the room the place that decides schema compatibility.
    Then a client with a newer schema could not write to an older room, and a
    deploy order between rooms and clients would matter where today it does
    not.
- **Validate envelopes only.** For example, every top-level entry is a map
  with an `id` and a `type`. This is cheaper, but it catches only the mistakes a
  compliant client never makes, and none of the payload-level ones that matter.
  It would be a gate that looks protective and mostly is not.
- **Quarantine on merge instead of dropping.** Keeping invalid objects visible
  as placeholders, as the load path does, would let people see and delete
  them. It was not done because a placeholder on every peer's canvas for a
  hostile editor's garbage is itself a vandalism vector, and deleting it would
  need a command that targets objects the domain refuses to read. It stays
  open as a product question, not a security one.

## Hardening that does not change the decision

These limit damage without making the room schema-aware. Each is its own
change:

- **Bound a socket message's size, and isolate decode failures.** _Done
  2026-10-03._ `BoardRoom.receive` refuses a message over `MAX_MESSAGE_BYTES`
  (32 MiB, the platform's own limit) before decoding it. _Since 2026-10-09 a
  message over 32 MiB travels in 4 MiB parts, held to 64 MiB while reassembled
  (`parts.ts`)._ The cap cannot be lower:
  publishing a board sends its whole state in one frame, and resyncing after
  offline work sends everything the room lacks in one. It catches a frame that fails to decode, and it also refuses an update
  whose application failed, which y-protocols reports but does not throw. In
  every case the room is unchanged and nothing is relayed. The Durable Object
  closes that socket alone, with 1009 or 1007.
- **Check `meta` patches on merge.** _Done 2026-10-03._ A remote `meta` patch
  is applied only if it is a title `SetBoardTitle` would accept: trimmed text, not
  blank, at most 200 characters. A change to `createdAt`, a cleared title and
  any unknown key are dropped (`isAcceptableRemoteMeta`, `remote-meta.ts`).
- **Awareness.** Viewers' awareness is relayed, and a peer can publish state
  for a client id that is not its own. Both are ephemeral and never persisted,
  so they are accepted for now.

## When to revisit

Revisit the decision, not only the hardening, when any of these happens:

- **Remote MCP transport ships (Phase 5a stage 5).** An agent on the network,
  holding an editor link for many boards, makes "an editor with a modified
  client" a far more likely writer.
- **A board is found in production holding content its clients drop.** At
  that point the reseed tool is no longer hypothetical.
- **The room starts doing anything with the content itself**, such as search,
  export, previews or server-side AI. A room that reads the document has to
  trust what it reads.
- **Editor links stop being bearer credentials**, for example verified
  identities in the room. Server-side validation would then have a person to
  attribute a rejection to.

## Consequences

- **Validation stays in one place.** Clients carry the domain's validation, and
  the room stays a fast, schema-free relay.
- **The worst a hostile editor can do** is store content that every client
  ignores, inflate the document, or overwrite valid content with valid-looking
  changes. The last is the same power any editor has; for an agent's changes,
  the shared change history and revert exist for it.
- **The security document** (`docs/architecture/11-security.md`) records this
  under "Known gaps" as accepted, with the hardening rows marked to fix.
