# 05 · Commands and undo

← [Documentation index](../README.md) · Source: [`packages/core/src/commands`](../../packages/core/src/commands)

**Every persistent change in OpenFrame goes through one door.** Not most; all.

---

## Commands are data

```ts
type Command =
  | { kind: 'CreateObjects'; objects: readonly NewObjectSpec[] }
  | { kind: 'DeleteObjects'; ids: readonly ObjectId[] }
  | { kind: 'MoveObjects'; moves: readonly { id: ObjectId; dx: number; dy: number }[] }
  | { kind: 'ResizeObjects'; resizes: readonly { id: ObjectId; frame: ObjectFrame }[] }
  | { kind: 'UpdateObjectData'; id: ObjectId; patch: Readonly<Record<string, unknown>> }
  | { kind: 'UpdateStyle'; ids: readonly ObjectId[]; style: ObjectStyle }
```

Plain JSON, deliberately. That is what lets a future MCP tool or HTTP endpoint
build one from a request body and hand it to the same dispatcher the toolbar
uses — rather than growing a second mutation path that quietly skips validation,
authorization and history.

### Granularity: one command per _logical user action_

Not per object, and not per input event. `MoveObjects` takes an array precisely
so that dragging three objects is one command, one patch batch, one undo entry,
one save and — later — one network message.

## The envelope

```ts
interface CommandEnvelope {
  readonly command: Command
  readonly actor: UserId | null
  readonly origin: Origin // 'user' | 'ai' | 'api' | 'mcp' | 'import' | 'remote'
  readonly transactionId: TransactionId
  readonly label: string // "Move 3 objects"
}
```

`origin` earns its place three times over:

1. **Audit** — who changed this, and through what.
2. **AI safety** — AI-originated changes can be previewed and rolled back as a group.
3. **Collaborative undo** — Yjs's `UndoManager` scopes history by transaction
   origin, so remote edits never land in your undo stack.

Adding it later would mean revisiting every call site.

---

## Patches

```ts
type Patch =
  | { op: 'add'; id: ObjectId; object: AnyOpenFrameObject }
  | { op: 'remove'; id: ObjectId }
  | { op: 'set'; id: ObjectId; path: readonly (string | number)[]; value: unknown }
```

Three operations. Not a CRDT format, not JSON Patch — **OpenFrame's own**, small,
closed and serializable. The collaboration adapter translates patches into Yjs
transactions, which is how CRDT types are kept out of the domain entirely.

A `set` with `value: undefined` **deletes** the key. That is how optional style
properties are cleared, and it is what makes inversion exact for properties that
did not previously exist.

### Inversion is generic

Handlers produce only _forward_ patches. `invertPatches(before, patches)` derives
the inverse generically, simulating each patch against the document state
immediately before it and reversing the result.

This means **undo correctness reduces to one property**, tested directly:

> applying a patch list and then its inverse returns the exact prior document

Which is why there is no separate "does undo work" test per command. A command
added next year inherits correct undo for free.

---

## The lifecycle: moving three objects

```
 1. INTENT      Pointer down on a selected object.
                interaction/ enters a drag. NO command, NO document write.

 2. PREVIEW     ~500 pointermove events.
                Only the live delta changes. The renderer draws
                committed frame + delta. Presence broadcasts the delta (later).
                ── still NO document write ──

 3. COMMIT      pointerup → ONE envelope:
                { command: { kind: 'MoveObjects', moves: [3 entries] },
                  actor, origin: 'user', transactionId, label: 'Move 3 objects' }

 4. AUTHORIZE   capabilities.can('edit', boardId)   → else rejected untouched

 5. VALIDATE    objects exist? not locked? numbers finite?
                → CommandError; the document is guaranteed unmodified

 6. HANDLE      pure handler → 3 × { op: 'set', path: ['frame'], value: … }
                Connectors touching these objects are NOT patched — their
                paths are derived at render time.

 7. APPLY       DocumentWriter.applyPatches in ONE transaction.
                Only the 3 affected listener channels fire.

 8. RECORD      One undo entry: { transactionId, label, origin, forward, inverse }

 9. EMIT        Subscribers persist (debounced) and later synchronise.
```

### The drag rule

**Nothing is written to the document while a gesture is in flight.**

This one rule delivers, simultaneously:

- correct undo granularity — 500 events, one undoable action
- correct multiplayer semantics — in-flight drags are presence, not history
- most of the interaction performance budget — no patches, no saves, no
  re-render of anything but the dragged objects

It is the most important operational rule in the codebase and it is stated in
[`CLAUDE.md`](../../CLAUDE.md) for that reason.

---

## Transactions

```ts
dispatcher.transact('Group selection', [
  { kind: 'CreateObjects', objects: [frameSpec] },
  { kind: 'ReparentObjects', ids: selection, parentId: frameId },
])
```

Several commands, one undo entry. Later commands see the results of earlier ones,
but **nothing is written to the store until every command has succeeded** — a
failure part-way through leaves the document untouched.

---

## Undo

```ts
interface UndoEntry {
  transactionId: TransactionId
  label: string
  origin: Origin
  forward: readonly Patch[]
  inverse: readonly Patch[]
}
```

A local, linear stack. Deliberately the simple version: correct for a single
editor, and explicitly **not** what multiplayer will use.

When collaboration lands, Yjs's `UndoManager` takes over and scopes history by
origin, so that undo reverts _your_ changes rather than whatever happened most
recently. That swap is an adapter change rather than a redesign because `origin`
is already on every entry and every command already produces patches instead of
mutating in place.

### Text editing

Text editing is a **session**, not a stream of commands. The in-progress buffer
is React state; one `UpdateObjectData` is dispatched when editing ends. Undo
inside the field belongs to the native input element, not to the board's history.

_(Clicking away from an editor must commit, not discard — this is tested in the
E2E suite because it was a real bug.)_

---

## Next

- [07 · Persistence](07-persistence.md) — where the patches go
- [09 · Collaboration](09-collaboration.md) — where they will also go
