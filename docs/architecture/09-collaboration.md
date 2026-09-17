# 09 · Collaboration

← [Documentation index](../README.md)

> **Design only. Nothing in this document is implemented.**
> It exists so that Phase 1 decisions do not foreclose it. See
> [Phase 4](../phases/phase-4-collaboration.md) for when this gets built.

---

## The likely choice: Yjs

MIT, roughly 920k weekly downloads, the largest provider ecosystem, and 10–50×
faster than Automerge on large documents.

- **Loro** is faster still and encodes smaller, but its ecosystem is early and
  every integration would be bespoke — the wrong trade for a solo developer.
- **Automerge**'s advantage is Git-like history, which OpenFrame does not need as
  a product feature.

⚠️ **Transport is explicitly undecided.** Two options that would have been natural
suggestions are stale: `partykit` last published May 2025, `@y-sweet/sdk`
September 2025. `y-websocket` and `@hocuspocus/server` are current. Re-verify at
adoption time — this is exactly why it is a
[deferred decision](../appendices/d-deferred-decisions.md).

---

## What goes where

| Yjs **document** — persisted, merged          | Yjs **awareness** — ephemeral, dropped on disconnect |
| --------------------------------------------- | ---------------------------------------------------- |
| `objects` map                                 | Cursor position                                      |
| `frame`, `style`, `data`, `parentId`, `order` | Selected object ids                                  |
| `locked`, `hidden`                            | **In-flight drag and resize deltas**                 |
| Asset references                              | Viewport (for follow-me)                             |
| Object `meta`                                 | "editing this object" indicator                      |
|                                               | User colour and display name                         |

The [drag rule](05-commands-and-undo.md#the-drag-rule) is what makes this clean:
a drag in progress is awareness, and only its committed result is document.
Others see live movement; history records one move.

**This is already how Phase 1 works.** Adopting collaboration does not require
changing it.

---

## Mapping

```
Y.Doc
 └─ Y.Map "objects"
     └─ ObjectId → Y.Map
         ├─ "frame"    → Y.Map { x, y, width, height, rotation }   (LWW per field)
         ├─ "style"    → Y.Map                                      (LWW per field)
         ├─ "parentId" → primitive                                  (LWW)
         ├─ "order"    → OrderKey string                            (LWW; fractional)
         ├─ "locked" / "hidden" → primitive                         (LWW)
         └─ "data"     → Y.Map, with Y.Text for collaborative text fields
```

Field-level last-writer-wins means two users editing colour and position
concurrently both win.

The document model was built for this: a **flat object map** avoids CRDT tree
merging, and **fractional ordering** makes a reorder a one-object write that
merges cleanly.

---

## How local changes become collaborative

```
dispatch(envelope)
  → handler produces Patch[]                  (domain, CRDT-free)
  → CollabAdapter.apply(patches, origin)
       ydoc.transact(() => { patch → Y.Map set/delete }, origin)
  → Yjs emits an update → provider broadcasts
```

## How remote changes enter

```
provider receives update
  → observeDeep fires with origin === 'remote'
  → adapter translates Y events → Patch[]
  → dispatcher.dispatch(..., { origin: 'remote', skipUndo: true })
  → only affected objects re-render
```

`skipUndo` already exists and is already tested. So does the `remote` origin.

> **No Yjs type may reach `core`, `interaction` or `ui`.**
> `Y.Doc` appears in exactly one directory: `web/adapters/collab/`.
> `.dependency-cruiser.cjs` will enforce it, as it already enforces the
> equivalent rule for the domain.

---

## Undo under collaboration

Yjs's `UndoManager` scopes by transaction origin, so switching from the local
inverse-patch stack is an **adapter swap, not a redesign** — because `origin` is
already recorded on every undo entry and every command already produces patches
rather than mutating in place.

The remaining question is a product one, not a technical one: should undo ever
revert someone else's change? That is
[deferred](../appendices/d-deferred-decisions.md).

---

## Open problems, named now

### Reparent cycles

A→B and B→A applied concurrently produce a cycle that no LWW register prevents.

**Mitigation:** the invariant checker already exists and already breaks cycles
deterministically (lowest `ObjectId` detaches to root). It must run in the merge
path from the first day of collaboration, not just on load.

### Migrating a live shared document

Genuinely hard. **Strategy:** version-gate at the room level. A client whose
`CURRENT_SCHEMA_VERSION` is below the room's refuses to connect and prompts for
reload; migration runs once, server-side, on a room with zero connections.

### Disconnected editing

Yjs buffers locally and merges on reconnect. Conflicts surface as
last-writer-wins per field — acceptable for spatial content, **not** acceptable
for text, which is why text fields become `Y.Text`.

### Assets while offline

The document holds only references. An asset uploaded offline yields a reference
whose bytes are not yet in shared storage; other clients render a placeholder
until upload completes. The document never blocks on bytes.

### Fractional index rebalancing

Rebalancing rewrites every sibling and conflicts badly under concurrent editing.
Once multiplayer exists it must be server-coordinated. See
[risk R5](../appendices/c-risks.md).

---

## Next

- [Phase 4 · Collaboration](../phases/phase-4-collaboration.md) — the build plan
- [ADR 0007](../adr/0007-collaboration-yjs-deferred.md) — the decision record
