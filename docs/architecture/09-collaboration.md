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

| The shared document: merged and kept | Presence: never stored, gone when the socket closes |
| ------------------------------------ | --------------------------------------------------- |
| Every object, whole                  | Display name and colour                             |
| The board's title (`meta`)           | Cursor position                                     |
| Room facts (`seeded`)                | Selected object ids                                 |
| Agents' change log                   |                                                     |

A drag in progress is not shared at all. Nothing is written to the document
during a gesture ([the drag rule](05-commands-and-undo.md#the-drag-rule)), so
other people see the object move when it is dropped, as one change. Presence is
validated on arrival like anything else from another browser
(`apps/web/src/scene/presence.ts`), and the room never reads it.

---

## The document

```
Y.Doc
 ├─ Y.Map "objects"   ObjectId → the whole object, as a plain JSON value
 ├─ Y.Map "meta"      the board's own fields: today, its title
 ├─ Y.Map "room"      facts about the room: `seeded`, once a browser has published
 └─ Y.Map "changes"   agents' changes, newest 50, for anyone to take back
```

Defined in `collab/src/document-map.ts` and `collab/src/change-log.ts`.

**Objects are plain values, not nested `Y.Map`s, and there is no `Y.Text`.** A
`set` patch addresses a path inside one object, and the edits that
realistically race are to different objects, because a gesture writes exactly
one change per object it touched. Nested maps would buy per-field merging for a
collision the command layer has already made rare, at the price of a second
representation of every object. The consequence is stated plainly under
[open problems](#open-problems).

Each map is its own root so that an older client carries what it does not
understand. The room relays and stores every root map without reading it, and
a client that observes only `objects` and `meta` never turns `room` or
`changes` into an edit.

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

A person's own changes are not logged, because their undo already covers them.

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
| 1009 | A message over the room's 32 MiB limit      | reconnects as usual              |

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

### Reparent cycles

A→B and B→A applied concurrently make a cycle no last-writer-wins value can
prevent. The session runs `RepairParentage` on any merged batch that could have
caused one, and the invariant checker breaks cycles the same way on every
client (the lowest `ObjectId` detaches to the root).

### A board must fit in one message

Publishing and catching up after time offline each send the whole state in one
frame, and the room accepts frames up to the platform's 32 MiB. A board whose
state approaches that cannot be published until the handshake is chunked. A
ten-thousand-object board is a few megabytes.

### No version gate between clients

Nothing stops two builds with different schemas sharing a room. What protects a
client is that an object whose `dataVersion` it does not know is dropped by
`readRemoteObject`, so an older client simply cannot see what a newer one
wrote, and does not damage it.

### Fractional index rebalancing

A rebalance rewrites every sibling, which conflicts badly when two clients do
it at once, and nothing coordinates it. See
[risk R5](../appendices/c-risks.md).

### Images

The document holds a reference; the bytes reach the room separately, through
`RoomAssetStore`. An image dropped while offline is visible to its uploader at
once and to everyone else when it has been uploaded; until then they see a
placeholder. The document never waits on bytes.

---

## Next

- [Phase 4 · Collaboration](../phases/phase-4-collaboration.md) — how it was built
- [11 · Security](11-security.md) — who may join a room, and what it trusts
