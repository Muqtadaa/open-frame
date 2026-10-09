# 09 · Collaboration

← [Documentation index](../README.md) · Source: [`packages/collab`](../../packages/collab/src) · [`apps/rooms`](../../apps/rooms/src)

How a board is shared, as built. The decisions behind it are
[ADR 0007](../adr/0007-collaboration-yjs-deferred.md) (Yjs),
[ADR 0013](../adr/0013-collaboration-transport-durable-objects.md) (one room per
board, in a Durable Object) and
[ADR 0016](../adr/0016-room-trust-boundary.md) (what the room trusts).

---

## The pieces

```
 browser A                                     browser B, or an agent (apps/mcp)
 ┌──────────────────────────────┐              ┌──────────────────────────────┐
 │ CommandDispatcher            │              │ CommandDispatcher            │
 │   ▲ remote        │ local    │              │   ▲ remote        │ local    │
 │ CollabSession (collab)       │              │ CollabSession (collab)       │
 │   Y.Doc ◄──► RoomProvider    │              │   Y.Doc ◄──► RoomProvider    │
 └──────────────┬───────────────┘              └──────────────┬───────────────┘
                │ WebSocket: Yjs sync + presence              │
                ▼                                             ▼
        ┌───────────────────────────────────────────────────────────┐
        │ apps/rooms: the Worker routes /room/<id> to that board's    │
        │ Durable Object (BoardRoomObject), which holds BoardRoom:    │
        │ one Y.Doc, everyone's presence, the board's keys, and its   │
        │ images in R2.                                               │
        └───────────────────────────────────────────────────────────┘
```

- **`packages/collab`** holds every line that knows about Yjs
  (`yjs-lives-only-in-collab` in `.dependency-cruiser.cjs`). The browser, the
  room and the MCP agent all use it, so all three speak exactly one protocol.
- **`BoardRoom`** (`collab/src/room.ts`) is the room's logic and has no idea it
  runs in a Durable Object. It is tested with plain objects that have a `send`
  method, which is what keeps ADR 0013 reversible.
- **`BoardRoomObject`** (`apps/rooms/src/room-object.ts`) adds the three things
  the room cannot do itself: hold sockets, hold storage and hold a name. It is
  also where admission is decided. See [Security](11-security.md).

---

## What goes where

| The shared document: merged and kept     | Presence: never stored, gone when the socket closes |
| ---------------------------------------- | --------------------------------------------------- |
| Every object, whole                      | Display name and colour                             |
| The board's title (`meta`)               | Cursor position                                     |
| Room facts (`seeded`)                    | Selected object ids                                 |
| Agents' change log                       |                                                     |
| Session timer and music (`facilitation`) |                                                     |
| Dot voting rounds and votes (objects)    |                                                     |

A drag in progress is not shared at all. Nothing is written to the document
during a gesture ([the drag rule](05-commands-and-undo.md#the-drag-rule)), so
other people see the object move when it is dropped, as one change. Presence is
validated on arrival like anything else from another browser
(`apps/web/src/scene/presence.ts`), and the room never reads it.

**What presence costs.** Every message is a request against the room server's
daily allowance, and every one wakes the room, so presence is kept to what
somebody can see (CLAUDE.md rule 29):

- **Nothing is sent alone.** A cursor, a selection or a pan goes out only while
  somebody else is in the room. When somebody arrives, this person's state is
  published once.
- **The cursor goes at most ten times a second** (`use-presence.ts`).
- **A tab renews its presence once a minute, not every 15 seconds**, and a peer
  unheard for two and a half minutes is forgotten (`startPresenceClock` in
  `collab/src/protocol.ts`). A tab that closes properly is removed at once, by
  the room.
- **The room keeps no timer.** A Durable Object cannot hibernate while one is
  pending, and is billed for every second it stays awake.

---

## The document

```
Y.Doc
 ├─ Y.Map "objects"   ObjectId → the whole object, as a plain JSON value
 ├─ Y.Map "meta"      the board's own fields: today, its title
 ├─ Y.Map "room"      facts about the room: `seeded`, once a browser has published
 ├─ Y.Map "changes"   agents' changes, newest 50, for anyone to take back
 └─ Y.Map "facilitation"  the session timer and music: not content, never undone (ADR 0017)
```

Defined in `collab/src/document-map.ts`, `collab/src/change-log.ts` and
`collab/src/facilitation.ts`.

**Objects are plain values, not nested `Y.Map`s, and there is no `Y.Text`.** A
`set` patch addresses a path inside one object, and the edits that
realistically race are to different objects, because a gesture writes exactly
one change per object it touched. Nested maps would buy per-field merging for a
collision the command layer has already made rare, at the price of a second
representation of every object. The consequence is stated plainly under
[open problems](#open-problems).

Each map is its own root so that an older client carries what it does not
understand. The room relays and stores every root map without reading it, and
a client that observes only `objects` and `meta` never turns `room`,
`changes` or `facilitation` into an edit.

---

## A local change

```
dispatch(command)                       origin 'user' (or 'mcp' from an agent)
  → handler produces Patch[]            pure; no CRDT anywhere in core
  → CollabSession sees the result       it subscribes to the dispatcher
       applyPatchesToDoc(doc, patches, LOCAL_ORIGIN)
       if the origin is mcp, ai or api: recordChange(...)  → "changes"
  → Yjs emits an update → RoomProvider sends it → the room relays and stores it
```

## A remote change

```
the room relays an update → Yjs applies it to this client's Y.Doc
  → CollabSession turns the Yjs events into Patch[]   (remote-patches.ts)
  → dispatch(ApplyRemotePatches, { origin: 'remote', skipUndo: true })
       every arriving object goes through readRemoteObject
       every change to the board's own fields through isAcceptableRemoteMeta
       anything that fails is dropped, never repaired, never thrown
  → if the batch could have broken parentage: RepairParentage
  → only the affected objects re-render
```

The `LOCAL_ORIGIN` tag is what stops a change echoing: the session skips Yjs
events it caused itself. Remote changes still go through `dispatch`, so they are
authorized, recorded and broadcast to subscribers like any other change; rule 3
holds with collaboration as it did without it.

Why invalid content is dropped rather than refused at the room is
[ADR 0016](../adr/0016-room-trust-boundary.md).

---

## Undo, and agents' changes

**Undo is local and stays local.** It reverts the changes you made, never
somebody else's: a remote change is dispatched with `skipUndo`, so it never
lands on your stack. Yjs's `UndoManager` is not used.

**What an agent does is recorded where everyone can see it.** A change made with
origin `mcp`, `ai` or `api` is written to the `changes` map with the agent's
label and the patches to take it back. Anyone on the board, person or agent,
can revert an entry; the revert goes through `CommandDispatcher.revert`, which
checks what it would put back the way it checks a merge, because any editor can
write to that map. The MCP tools are `list_changes` and `revert_change`.

Only edits to the board are logged. A comment an agent leaves (`add_comment`)
is written through its account to Supabase, like anyone's, and is neither in
the document nor in this log.

A person's own changes are not logged, because their undo already covers them.

---

## The session timer, and the room's clock

The timer is the state of a meeting about the board, not part of it
([ADR 0017](../adr/0017-facilitation-state-outside-the-document.md)). It is one
record in the `facilitation` map, replaced whole, written through
`BoardConnection.writeTimer` rather than the dispatcher, and read through the
strict `readTimer` because any editor can write there. Its rules (start,
pause, resume, reset, add a minute) are pure, in `@openframe/core/facilitation`,
and a local board runs the same ones from `localStorage`.

It runs on the **room's** clock. The room answers `MESSAGE_TIME` (3) to the
asker alone, and `ServerClock` keeps the offset from the quickest of the last
eight round trips. A client asks three times on connecting, every five minutes
and when the page becomes visible. "Done" is never stored; it is worked out
from that clock. The controls that write a time wait for the first answer,
because a deadline written on a skewed clock cannot be repaired afterwards. An
older room ignores the question, and after five seconds connected the client
runs the timer on its own clock.

**Session music** is a second record in the same map, read through `readMusic`:
a genre, its playlist (track ids and lengths, pinned when it started), and when
that playlist started on the room's clock. Which track is playing, and how far
into it, is worked out on each device from that clock and the pinned playlist
(`positionOf`), so a device that joins late lands where everybody else is, and
two devices holding different versions of the catalogue still agree; the
catalogue only supplies titles. The tracks are CC0 files the rooms Worker serves publicly at
`/music/track/:id` from its own bucket, with byte ranges so a device can seek.
`/music/catalogue` lists them, and it is the catalogue, kept in git, that
decides what may be served. A device makes no sound until somebody there
presses something, and mute and volume are that device's alone.

---

## Dot voting

Unlike the timer, a round of dot voting IS on the board: it is something
people will want afterwards, so it is saved, shared and undone like any
object, through the dispatcher (rule 3). It is not drawn on it — both types are
`spatial: false`, like a relation or a reaction.

- A **`vote-round`** holds the title, which notes are in scope (the board,
  what one frame holds, or the notes selected when it started), how many dots
  each person gets, whether counts are hidden, and whether it is open. There is
  one per board: starting a round replaces one that has ended, in the same
  command, and is refused while one is open. A round is named by its run on
  the board (`vr_<n>`), so two people starting one at the same moment write
  ONE round, and every dot either casts is in it.
- A **`vote`** is one dot, marked on its note and `within` its round, so the
  registry's mark index counts them and deleting the note or clearing the round
  takes them with it. Nothing keeps a tally.
- A dot's id is the person's SLOT in the round (`vt_<round>_<key>_<n>`). Two
  devices casting for one person at the same moment take the same free slot and
  converge on one object, so nobody ever holds more dots than the round gives.

A **poll** works the same way. Each person's pick is a `poll-answer` object
marked on the poll, with the id `pa_<poll>_<option>_<key>`, so two people
answering at once are both counted, and one person on two devices is one
answer. Rewording an option keeps the answers on it, because an answer names
its option by id. A removed option's answers are left where they are,
uncounted.

"Hidden" is hidden by the interface only. The votes are objects in the shared
document, and anybody who reads it can count them.

---

## Joining, losing and refusing a connection

`RoomProvider` (`collab/src/provider.ts`) opens the socket, runs the Yjs
handshake from both sides and reconnects with a backoff that doubles to 30
seconds. A few close codes mean "do not retry":

| Code | Meaning                                     | The client                       |
| ---- | ------------------------------------------- | -------------------------------- |
| 4003 | The board has a password and none was given | stops and asks for it (`locked`) |
| 4004 | The board was deleted                       | stops for good (`gone`)          |
| 1007 | A message the room could not read           | reconnects as usual              |
| 1009 | A frame over the room's 32 MiB limit        | reconnects as usual              |

A viewer's socket is accepted and its edits are dropped by the room before they
are read; the role is sent to the client first, so the interface never invites
an edit it would lose.

**Offline.** Each browser keeps a shared board's whole `Y.Doc` in IndexedDB
(`adapters/indexeddb/crdt-store.ts`), so a session starts from what it last saw
and edits made offline merge on reconnect. See [Persistence](07-persistence.md).

**Publishing.** The first browser to share a board seeds the room with it in a
single transaction (`seedDoc`) and sets `room.seeded`.

---

## Open problems

### Concurrent edits to the same object

Last writer wins **per object**. If two people change the same note at the same
moment, one change is kept whole and the other is lost, text included. That is
the price of whole-object values, accepted because the command layer makes the
collision rare; per-field or per-character merging would be the fix if it stops
being rare.

Where a collision is the NORMAL case it is designed out instead. A reaction is
an object of its own per person, kind and note (`rx_<note>_<glyph>_<person>`),
never a counter inside the note, so ten people pressing 👍 at once write ten
different objects and all ten are kept. The deterministic id is what makes one
person on two devices converge on one reaction rather than two. Each is a mark
(`ObjectTypeDefinition.mark`), indexed by the registry once per document, and
goes with its note on delete — and comes back with it on undo.

### Reparent cycles

A→B and B→A applied concurrently make a cycle no last-writer-wins value can
prevent. The session runs `RepairParentage` on any merged batch that could have
caused one, and the invariant checker breaks cycles the same way on every
client (the lowest `ObjectId` detaches to the root).

### A large board travels, and is kept, in parts

Publishing a board sends its whole state as one message, and so does the
room's answer to somebody opening it. The platform drops a frame over 32 MiB,
so a message over that is cut into 4 MiB parts (`MESSAGE_PART`, `parts.ts`)
and put back together on the other side — at most 64 MiB of one, which is
memory the room can afford. Parts arrive in order on one socket; one out of
order (a room evicted mid-message loses the parts before it) closes the
connection with 1007, and the sender reconnects and sends the whole message
again. Anything up to 32 MiB is sent whole, exactly as before, because a peer
still on the previous version drops a part as a type it has never met: split
lower, a board it could open would never arrive in a tab that had not reloaded.

The room keeps the board the same way. A Durable Object value holds at most
2 MB, so the snapshot is written as 1 MiB parts under a manifest, in one
atomic write, and a change too large for one value is folded straight into a
new snapshot rather than stored as one (`apps/rooms/src/document-store.ts`).
Before, a board over about 2 MB was relayed to everyone and never saved.

Reconnecting is cheaper. Each side sends only a state vector, and the answer
holds only what the other lacks, so what has to fit is what changed while
offline, not the board.

### No version gate between clients

Nothing stops two builds with different schemas sharing a room. What protects a
client is that an object whose `dataVersion` it does not know is dropped by
`readRemoteObject`, so an older client simply cannot see what a newer one
wrote, and does not damage it.

### Fractional index rebalancing

Two objects added on top at once share a key; siblings are ordered by key and
then id (`compareSiblings`), so every client stacks them the same way. A
rebalance, which would give such a pair room between them, rewrites every
sibling, which conflicts badly when two clients do it at once, and nothing
coordinates it. See [risk R5](../appendices/c-risks.md).

### Images

The document holds a reference; the bytes reach the room separately, through
`RoomAssetStore`. An image dropped while offline is visible to its uploader at
once and to everyone else when it has been uploaded; until then they see a
placeholder. The document never waits on bytes.

---

## Next

- [Phase 4 · Collaboration](../phases/phase-4-collaboration.md) — how it was built
- [11 · Security](11-security.md) — who may join a room, and what it trusts
