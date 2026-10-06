# ADR 0019 · Version history: whole snapshots, thinned, restored as an edit

**Status:** Accepted · 2026-10-06 · the room's half built in the first PR; the
browser's half, the history panel with restore, and named versions follow.
Cites ADR 0013, ADR 0016 and rule 7.

## Context

Until now, nothing kept an earlier state of a board:

- the room kept one compacted snapshot plus the updates since it
  (`apps/rooms/src/room-object.ts`, `#compact`);
- the change log keeps only agents' last 50 changes, so they can be reverted
  (`packages/collab/src/change-log.ts`);
- a local board is one row in IndexedDB.

A mistake that undo could not reach — somebody else's, an old one, a whole
afternoon's — was permanent. The parity matrix ranks this among the
replacement-critical gaps (`docs/product/parity-matrix.md`).

The person who decides product questions decided these (2026-10-06):

| Question                     | Decision                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| When is a version taken?     | Automatically when editing settles, at most one every 10 minutes while anyone edits. Editors can also save a **named** version. |
| How long are versions kept?  | Every automatic version for 30 days, then one a day up to 90 days, then none. Named versions until somebody deletes them.       |
| Who may restore?             | Editors. A restore is itself kept as a version, so it can be undone and nothing is lost. Viewers may browse.                    |
| Do local boards have it too? | Yes, in the browser, for 14 days. Named versions until deleted.                                                                 |

## Decision

### One policy, two stores

When a version is due and which versions are kept are pure functions in
`@openframe/core/history` (`version-policy.ts`): `versionDueAt`,
`versionsToDrop` and `nextThinningAt`. The room and the browser both call
them, with different `Retention`, for the reason the upload policy is shared:
two copies of these rules would drift.

- **Due:** quiet for `SETTLE_MS` (2 minutes) or `MAX_INTERVAL_MS` (10 minutes)
  of unversioned editing, whichever comes first — and never sooner than
  10 minutes after the last version. So a board edited without a pause gets
  one every 10 minutes, and one edited in bursts does not get one per burst.
- **Kept:** named always. Automatic versions are kept in three bands: all of
  them while younger than `keepAllFor`; the last of each UTC day until
  `keepUntil`; none after that. Days are UTC so the room, which has no time
  zone, and every browser agree on which versions share a day.

### The room: whole Yjs snapshots in R2, woken by an alarm

- **What a version is.** The room's whole document as Yjs bytes, gzipped. The
  room does not read it, exactly as it reads no update (ADR 0016). Whoever
  opens a version decodes it, and every object in it goes through the same
  check as every remote object (`readRemoteObject`).
- **Where it lives.** Its bytes go to R2 at `<boardId>/versions/<versionId>`.
  Its record (`{id, at, kind, name?, bytes}`) goes in Durable Object storage
  under `v:<id>`. The record is the authority: a version without a record
  does not exist, whatever is in the bucket. Because the bytes sit under the
  board's own prefix, the sweep that removes a board's images when it is
  destroyed takes its history too (`purgeBoardAssets`), and an image cannot
  be named over a version because an image id cannot contain a slash
  (`route.ts`).
- **When.** `#persist` tells `RoomHistory.edited()` after each change is
  safely stored. The first edit after a version marks the board dirty and sets
  the Durable Object's alarm for when it would settle. Further edits write
  nothing. When the alarm fires, `RoomHistory.alarm()` asks `versionDueAt`
  again: if somebody kept editing, it sets the alarm later and goes back to
  sleep. Otherwise it takes the version, thins, and sets the next alarm,
  either for the next version or for the next thinning, whichever comes
  first. Thinning runs at most once a day.
- **Failure.** A version that cannot be written throws, so the runtime retries
  the alarm. If the retries run out, the next edit finds a dirty board with no
  alarm and sets one. An edit that arrives while a version is being written
  leaves the board dirty, because that version does not contain it.
- **Destruction.** The alarm does nothing for a board that is going. A
  version written while a destroy began is taken back out, as an upload is.
  The destroy drains in-flight writes (`InFlight`), deletes the alarm, and
  sweeps the prefix.
- **Reading.** `GET /room/:id/versions` lists the versions and
  `GET /room/:id/versions/:versionId` returns one. Both are allowed by
  `readDecision` in `access.ts`, which images now share: any valid link, the
  password as a second factor, and the owner never asked for it. Nothing in
  the room writes a version on a client's request yet; named versions add
  that, for editors only.

### Restore: an edit, through the command layer (rule 3)

Restoring is done by an editor's own client, not by the room:

1. **Keep the current state first.** The client asks for this through
   `history.keepNow()`: `POST /room/:id/versions` for an editor or the owner
   (`keepVersionDecision`), or the browser's keeper for a local board. If the
   current state cannot be kept, nothing is restored.
2. **Read the version.** Open it and read its objects with
   `readVersionObjects`, the same check `readRemoteObject` applies to every
   remote object.
3. **Dispatch one command.** `RestoreBoard` turns the live board into the
   version, worked out against the current document: objects that are gone are
   removed, objects that are missing are added, and objects that changed are
   replaced whole. The title is set as well.

That one command is one undo entry, crosses the socket like any other edit,
and is taken as a new version once it settles. Locks are restored along with
everything else, so a lock neither blocks a restore nor survives one
unchanged.

If any object in the version cannot be read by this build, the restore is
refused as a whole. The version can still be browsed, unless the preview
itself cannot be built, because the preview applies the same check. Rule 7:
never write back a board that could not be fully read. Only editors may
restore: viewers are offered no button, and the command is refused by the
capabilities a viewer's session holds.

### Browsing: the version on the canvas

The user chose this on 2026-10-06. Choosing a version in the History panel
(in the navigation bar) puts it on the canvas in place of the board as it is
now. A bar across the top reads "Viewing {time}", with **Restore this
version** for editors and **Back to now** for everyone.

The version is shown by a runtime of its own (`app/version-preview.ts`):

- **its own document store,** separate from the live board's;
- **a dispatcher with read-only capabilities,** so every edit and undo is
  refused;
- **no persistence of any kind:** no autosave, no history keeper, no room.

The live board keeps running underneath, so other people's edits still
arrive, and **Back to now** simply stops showing the version. The bar reads
the live runtime, so the restore is dispatched there and never on the
preview.

### A local board: the browser's own store

A new IndexedDB store, `versions`, holds the persisted board envelope (what
`serializeBoard` writes, so opening a version is `deserializeBoard`, quarantine
included). Versions are taken from the same command stream autosave listens
to, with the same `versionDueAt`, and kept by `LOCAL_RETENTION`: 14 days, then
named versions only (`apps/web/src/app/local-history.ts`). The keeper is never
attached to a read-only board (rule 7) or to a shared one.

- **Keys.** A row's key is `<boardId>|<versionId>|<a or n>`. That holds
  everything thinning needs, so the whole store is listed with its keys and no
  board is read back to decide what to keep
  (`adapters/indexeddb/version-store.ts`).
- **Thinning covers every board in this browser, not only the open one.** A
  board deleted elsewhere is never opened again to thin its own versions, and
  neither is one shared since, which moved to a new id. Thinning everything is
  what lets their versions age out.
- **Deleting a board** forgets its versions, named ones included, along with
  its CRDT.

**What a version does not hold:**

- **comments,** which live in Supabase;
- **facilitation state** (ADR 0017);
- **the agent change log.**

A restore replaces only the objects and the title. Images are kept until the
board is deleted, so a restored version's pictures are still there.

## Rejected

- **Durable Object storage for the bytes.** It is the board's live document
  and update log. Its values are capped at 2 MB. And versions would multiply
  what every compaction and cold start pays for. R2 has neither problem, and
  the board's prefix already gives deletion for free.
- **A separate R2 prefix such as `history/<boardId>/`.** Board ids are
  user-chosen. A board named `history` would then own a prefix covering every
  board's history, and its destroy would sweep them all.
- **Serialising the board in the room.** The room would have to interpret
  objects it has decided not to interpret (ADR 0016). The schema it serialised
  against would be the room's build, not the clients'.
- **Diffs between versions instead of snapshots.** Each version would depend
  on its neighbours, so thinning one would mean rewriting others. A gzipped
  snapshot of a board is small enough that this is not worth it.
- **A timer moved by every edit.** That would be a storage write per edit
  for nothing. The alarm checks whether editing has settled when it fires.
- **Restoring as a new board** (Miro's model). The board's links, comments
  and members stay with the board people already have. A restore that moved
  them elsewhere would leave everyone on the old one.
- **Restoring on the server.** It would need the room to validate objects, see
  above, and it would not be one undo entry for the person who did it.

## Consequences

- **A restore races whoever is editing at that moment,** as any edit does:
  per object, the last write wins. Someone moving a note while it is restored
  may keep their move or lose it. Nothing is lost for good: the state before
  the restore is kept as a version, and the restore is one undo entry. That
  is the trade against restoring as a new board, rejected above.

- **The last edit time is kept in memory only.** A room evicted mid-session
  forgets it and judges "settled" from when the board became dirty. Eviction
  only happens once a room has been idle, so the cost is a version taken a
  little sooner than two minutes after the last edit.
- **A version holds whatever editors wrote, including objects no client would
  accept.** The client filters them when it opens the version, as it does for
  live edits. A version with any such object cannot be restored.
- **The rooms suite runs history in seconds.** `HISTORY_TIMING` is passed to
  `wrangler dev` by `playwright.rooms.config.ts` and must never be set in
  `wrangler.toml`.
