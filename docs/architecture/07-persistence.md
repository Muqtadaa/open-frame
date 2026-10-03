# 07 · Persistence

← [Documentation index](../README.md) · Source: [`ports/board-repository.ts`](../../packages/core/src/ports/board-repository.ts) · [`adapters/`](../../apps/web/src/adapters)

---

## The port

```ts
interface BoardRepository {
  getBoard(id: BoardId): Promise<LoadResult | { status: 'not-found' }>
  saveBoard(document: BoardDocument): Promise<void>
  applyPatches(id: BoardId, patches: readonly Patch[]): Promise<void>
  listBoards(): Promise<readonly BoardSummary[]>
  deleteBoard(id: BoardId): Promise<void>
}
```

### Why `applyPatches` exists on day one

The IndexedDB adapter satisfies it by read-modify-write, which is not obviously
useful. It is there anyway because designing the port around whole-document
saves would bake that assumption into **every call site**. The day a real
database arrives — where writing an entire board on every drag is not an
option — the change would no longer be a new class but a rewrite.

The cost of having it now is a few lines. The cost of adding it later is the
call sites.

### Why there is no `updatedAt` on the document

"Last modified" is derived **here**, at the persistence layer, precisely so it is
not a contended field inside shared board state. See
[State ownership](02-state-ownership.md).

---

## Implementations

| Adapter                    | Used by                | Storage            |
| -------------------------- | ---------------------- | ------------------ |
| `MemoryBoardRepository`    | tests, E2E clean slate | a `Map`            |
| `IndexedDbBoardRepository` | the browser app        | IndexedDB, raw API |

A shared board is still saved through this port, in each browser that opens it:
the room is where it is shared, not where the interface reads it from. See
[Where a board lives](#where-a-board-lives) below.

Both are exercised by **the same test suite**
([`adapters.test.ts`](../../apps/web/src/adapters/adapters.test.ts)) via
`describe.each`. That is the point of the port: another adapter gets an
executable specification to satisfy rather than a prose description to interpret.

`MemoryBoardRepository` serializes and deserializes exactly as the real adapter
does, rather than holding live documents — so tests exercise the real round trip
instead of a shortcut that would hide serialization bugs.

### Why raw IndexedDB and not a wrapper

The surface needed is four operations. The
[dependency policy](../appendices/a-technology-decisions.md) says not to take on
a package for what a few lines of stable code can do. The verbose parts are
wrapped in one `promisify` helper.

---

## Autosave

Attached at the composition root to the **command stream**, not to React:

```ts
dispatcher.subscribe(() => {
  clearTimeout(timer)
  timer = setTimeout(() => void repository.saveBoard(store.getDocument()), 500)
})
```

Saves are coalesced, so a burst of commands produces one write. Sharing did not
change this call site: changes reach other people through the collaboration
session, which subscribes to the same command stream (see
[Collaboration](09-collaboration.md)), not through the repository.

**Autosave is never attached to a quarantined board.**

---

## Where a board lives

A local board lives in one place; a shared board lives in four, and each holds
something different.

| Where                             | What it holds                                                                                                          | Source                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| This browser: `boards` store      | The board document, as the interface reads it. Every board, shared or not.                                             | `adapters/indexeddb/indexeddb-board-repository.ts`       |
| This browser: `crdt` store        | A shared board's whole `Y.Doc`, one row per board, so a session starts from what it last saw rather than from empty.   | `adapters/indexeddb/crdt-store.ts`                       |
| The room (Durable Object storage) | The shared `Y.Doc`: a compacted snapshot plus up to 64 loose updates.                                                  | `apps/rooms/src/room-object.ts` (`#persist`, `#compact`) |
| Supabase                          | Who owns and may open a board, its title and links, workspaces, comments and mentions. **Never the board's contents.** | `supabase/migrations/`                                   |

The room is the copy everyone agrees on. The browser's two stores are what make
a shared board open instantly and keep working offline; the CRDT cache in
particular is not an optimisation, because a session that started from an empty
`Y.Doc` dropped every edit to an object the doc did not yet hold.

Keeping board contents out of the database is deliberate (see
[`supabase/README.md`](../../supabase/README.md)): a free project pausing after a
week idle blocks sign-in and the board list, never anybody's work.

A build with no `VITE_COLLAB_URL` and no `VITE_SUPABASE_URL` is still a whole
application: no room server and no accounts, every board in this browser. (The
committed `apps/web/.env` sets both, so `pnpm dev` talks to the deployed room
server; the E2E suite overrides that.)

What has not changed is that the domain does not notice any of this.

---

## Assets

```ts
interface AssetStore {
  put(id: AssetId, blob: AssetBlob): Promise<AssetRef>
  resolve(ref: AssetRef): Promise<string>
  delete(id: AssetId): Promise<void>
}
```

Note `AssetBlob` is a **structural** interface, not a DOM `Blob`:

```ts
interface AssetBlob {
  readonly size: number
  readonly type: string
  arrayBuffer(): Promise<ArrayBuffer>
}
```

A browser `Blob` satisfies it as-is, and so does a Node buffer wrapper, without
`@openframe/core` depending on `lib.dom`. It is a small illustration of the
general rule: **the domain names what it needs, and adapters supply something
that fits.**

Implemented by `IndexedDbAssetStore` in the browser. On a shared board it is
wrapped by `RoomAssetStore` (`adapters/room/room-asset-store.ts`), which also
uploads the bytes to the room, where they are kept in R2 for everyone who can
open the board. The local store is still written first and asked first, so a
picture appears the moment it is dropped and keeps painting offline. What the
room accepts is the same upload policy the browser checks
(`@openframe/core/uploads`), and destroying a board deletes its images.

Two things about it are worth knowing before writing a second adapter:

**The stored locator is `idb:<id>`, never an object URL.** An object URL is
minted per page load and dies with the tab, so persisting one would leave every
image on a reloaded board pointing at nothing. Turning a locator into something
the browser can paint is the adapter's job — which is exactly the seam the room
store uses: its locators are `room:<id>`, resolved to the room's image URL
without the document changing.

**Object URLs are cached per asset and revoked on delete.** `resolve` is called
from the render path, so minting a fresh URL each time would pin one decoded
blob in memory per frame — a leak that grows with time on the page rather than
with the size of the board.

Both adapters share one `database.ts`, which owns the database name, its version
and every object store. An IndexedDB database has a single version and a single
upgrade path, so two adapters each calling `indexedDB.open` with their own
version number would fight: whichever opened second with a lower version would
fail outright. Adding a store means adding it there and bumping the version; the
upgrade from v1 (boards only) to v2 (boards + assets) is covered by a test that
builds a real v1 database first, because an upgrade that throws leaves an
existing user unable to open their own boards.

---

## Next

- [09 · Collaboration](09-collaboration.md) — the other consumer of the patch stream
- [11 · Security](11-security.md) — who may read and write each of these
