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

Both are exercised by **the same test suite**
([`adapters.test.ts`](../../apps/web/src/adapters/adapters.test.ts)) via
`describe.each`. That is the point of the port: a future Postgres adapter gets an
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

Saves are coalesced, so a burst of commands produces one write. Because the port
is already patch-aware, a future server adapter can stream patches here instead
of rewriting the whole board — without this call site changing.

**Autosave is never attached to a quarantined board.**

---

## Phase 1 scope, and what comes next

Today: one board, in the user's own browser, no server and no account. That is
enough to prove every seam and requires no infrastructure to run locally —
`pnpm dev` and nothing else.

The next step is _not_ decided yet, and deliberately so. Whether boards move to
Postgres, Supabase, or SQLite-at-the-edge depends on the collaboration topology,
which depends on decisions listed in
[Deferred decisions](../appendices/d-deferred-decisions.md).

What is decided is that the domain will not notice.

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

_(No asset implementation exists yet — images arrive in
[Phase 2](../phases/phase-2-core-canvas.md).)_

---

## Next

- [09 · Collaboration](09-collaboration.md) — the other consumer of the patch stream
- [11 · Security](11-security.md) — what changes when a server appears
