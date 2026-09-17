# 02 · State ownership

← [Documentation index](../README.md)

Every value in the system has exactly one authoritative owner. This table is the
answer to "where should this live?" — if something you are adding is not on it,
work out which row it resembles before writing code.

---

## The matrix

| State                           | Owner                         | Persistent? |      Collaborative?      | Example                                 |
| ------------------------------- | ----------------------------- | :---------: | :----------------------: | --------------------------------------- |
| Object geometry (`frame`)       | `core` DocumentStore          |     ✅      |       ✅ document        | Sticky at (120, 340)                    |
| Object semantic `data`          | `core` DocumentStore          |     ✅      |       ✅ document        | `evidence.participant = "P07"`          |
| Object `style` tokens           | `core` DocumentStore          |     ✅      |       ✅ document        | `color: "yellow"`                       |
| Hierarchy (`parentId`, `order`) | `core` DocumentStore          |     ✅      |       ✅ document        | Sticky inside a frame                   |
| Connector endpoints             | `core` DocumentStore          |     ✅      |       ✅ document        | `from: { object, anchor }`              |
| Connector **path geometry**     | _derived, never stored_       |     ❌      |            ❌            | Recomputed from endpoints               |
| `locked` / `hidden`             | `core` DocumentStore          |     ✅      |       ✅ document        | Locked background frame                 |
| Creation provenance (`meta`)    | `core` DocumentStore          |     ✅      |       ✅ document        | `createdVia: 'ai'`                      |
| Board schema version            | Persisted envelope            |     ✅      |           n/a            | `schemaVersion: 1`                      |
| Asset **references**            | `core` DocumentStore          |     ✅      |       ✅ document        | `assetId: "ast_9f"`                     |
| Asset **bytes**                 | AssetStore port               |     ✅      |            ❌            | PNG in IndexedDB → later object storage |
| Active tool                     | `web` interaction store       |     ❌      |            ❌            | `"select"`                              |
| Selection                       | `web` interaction store       |     ❌      | ➡️ projected to presence | `{obj_1, obj_7}`                        |
| Hover target                    | `web` interaction store       |     ❌      |            ❌            | `obj_4`                                 |
| **In-flight drag delta**        | `web` interaction store       |     ❌      | ➡️ projected to presence | `{ dx: 40, dy: -12 }`                   |
| Marquee rectangle               | `web` interaction store       |     ❌      |            ❌            | Rubber band                             |
| Text-editing buffer             | React local state             |     ❌      |     later: CRDT text     | Uncommitted keystrokes                  |
| Local viewport                  | `web` interaction store       | 🟡 UX only  | ➡️ presence (follow-me)  | `{ x, y, zoom: 1.4 }`                   |
| Open menus, banners             | React local state             |     ❌      |            ❌            | Dismissed notice                        |
| Undo/redo stack                 | `core` UndoStack (per client) |     ❌      | ❌ (origin-scoped later) | 40 inverse-patch entries                |
| Remote cursors                  | Presence adapter _(later)_    |     ❌      |       ✅ awareness       | Bob at (400, 200)                       |
| Connected users                 | Presence adapter _(later)_    |     ❌      |       ✅ awareness       | 3 online                                |
| Users, workspaces, permissions  | Server database _(later)_     |     ✅      |            ❌            | Membership row                          |
| Board metadata, thumbnails      | Server database _(later)_     |     ✅      |            ❌            | "Q3 Research"                           |
| Remote query cache              | TanStack Query _(later)_      |     ❌      |            ❌            | Board list                              |

---

## The rules this encodes

**Nothing from the interaction store is ever written to the document except by an
explicit command on commit.** A drag in progress, a hover, a marquee — these
belong to this tab and this moment.

**Selection and drag deltas are _projected_ onto presence, never _stored_ there
as truth.** The interaction store stays authoritative locally; presence is a
write-only mirror. Remote presence arrives in a separate read-only store that
only overlay components consume.

**Connector paths are derived.** Moving an object must never write to a
connector. Storing the path would multiply patch volume, corrupt undo
granularity, and manufacture conflicts between users who moved unrelated things.

**There is no `updatedAt` on an object.** Stamping a shared field on every
mutation turns every edit into a write to contended state. "Last modified" for a
board is derived at the persistence layer instead — see
[ADR 0003](../adr/0003-canonical-document-model.md).

**Asset bytes are never in the document.** Objects hold an `AssetRef`; the bytes
live behind the `AssetStore` port. An object may reference an asset whose bytes
have not arrived; the renderer shows a placeholder rather than blocking.

---

## How the split is enforced in code

The document store exposes two separate handles:

```ts
const { store, writer } = createDocumentStore(document)
```

`DocumentStore` has no mutating methods at all. `DocumentWriter` is held only by
the composition root, which passes it to the command dispatcher and nowhere
else. "The UI must not mutate the document" is therefore a fact about what the
types make reachable, not a rule someone has to remember.

---

## Next

- [03 · Document model](03-document-model.md) — the shape of persistent state
- [05 · Commands and undo](05-commands-and-undo.md) — how it legally changes
