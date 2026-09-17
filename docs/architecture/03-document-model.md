# 03 · Document model

← [Documentation index](../README.md) · Source: [`packages/core/src/domain`](../../packages/core/src/domain)

---

## What a board is

```ts
interface BoardDocument {
  readonly id: BoardId
  readonly objects: ReadonlyMap<ObjectId, AnyOpenFrameObject>
  readonly assets: ReadonlyMap<AssetId, AssetRef>
  readonly meta: BoardDocumentMeta
}
```

A **flat map**, not a tree. Hierarchy is derived from each object's `parentId`
and sibling `order`.

A literal tree would be easier to read and worse in every other way: subtree
moves become deep rewrites, lookups become traversals, and — decisively — trees
merge badly under concurrent editing, whereas a flat map with parent pointers
needs only a cycle check.

## What an object is

```ts
interface ObjectBase<TType extends string, TData> {
  readonly id: ObjectId
  readonly type: TType
  readonly dataVersion: number // this TYPE's payload version
  readonly frame: ObjectFrame // x, y, width, height, rotation
  readonly parentId: ObjectId | null // null = board root
  readonly order: OrderKey // fractional index, NOT a z-number
  readonly style: ObjectStyle // sparse, token-valued
  readonly locked: boolean
  readonly hidden: boolean
  readonly data: TData // owned by the type
  readonly meta: ObjectMeta // CREATION provenance only
}
```

Every object of every type has exactly this shape. A sticky note and a research
`evidence` object are identical to the command layer, the renderer, persistence,
undo and the spatial index. That is what makes new semantic types cheap.

---

## The consequential choices

### Ordering is a fractional index, not a z-number

```ts
type OrderKey = Brand<string, 'OrderKey'> // "a0", "a1", "a0V" — compared as strings
```

Integer z-indices force you to renumber every sibling on reorder. Fractional
indices make a reorder a **one-object write**, which matters for undo size,
persistence volume and — decisively — concurrent editing, where two users
reordering at once must not clobber each other.

Measured against `fractional-indexing` v4, keys grow about **one character per
six inserts between the same two neighbours**, so the rebalance threshold of 40
characters is reached after roughly 230 of them. We detect that rather than
prevent it; see [risk R5](../appendices/c-risks.md).

### Style is sparse and token-valued

```ts
interface ObjectStyle {
  readonly color?: ColorToken // 'yellow' — never '#ffe57f'
  readonly fill?: FillToken
  readonly opacity?: number
  // …
}
```

Tokens keep theming possible, keep documents small, make "make this red"
expressible by an AI command, and stop the document encoding one particular
visual design forever.

Each type declares which properties it honours via `capabilities.styleProps`, so
a style command applies across a mixed selection **without any code switching on
object type**. Unsupported properties are skipped, not rejected.

### Identity is branded

```ts
type ObjectId = Brand<string, 'ObjectId'>
type AssetId = Brand<string, 'AssetId'>
```

Both are strings at runtime, mutually unassignable at compile time. Passing an
`AssetId` where an `ObjectId` belongs is a type error rather than a silent
lookup miss.

### `meta` records creation only

There is deliberately **no `updatedAt` or `updatedBy`**. Writing a shared field
on every mutation manufactures merge conflicts between users who touched
unrelated properties and inflates patch volume for data nothing reads in the
render path. Board-level "last modified" is derived at the persistence layer.

### Connectors store endpoints; paths are derived

```ts
type ConnectorEndpoint =
  { kind: 'point'; point: Point } | { kind: 'object'; objectId: ObjectId; anchor: Anchor }

type Anchor =
  | { kind: 'auto' }
  | { kind: 'side'; side: 'top' | 'right' | 'bottom' | 'left' }
  | { kind: 'relative'; u: number; v: number } // normalised 0..1 — survives resize
```

Moving an object never patches a connector. The path is recomputed at render
time. _(Connectors are modelled but not implemented — see
[Phase 2](../phases/phase-2-core-canvas.md).)_

### Unknown types are first-class

```ts
interface UnknownData {
  readonly originalType: string
  readonly originalVersion: number
  readonly raw?: unknown // preserved byte-for-byte
}
```

A board containing a type this build does not know still opens. The object
renders as a labelled placeholder, can be moved or deleted, and is written back
**unchanged** on save. This exists from day one rather than being retrofitted,
because forward compatibility that is not exercised from the start does not
work. It is tested by an explicit round-trip assertion.

---

## Invariants

Enforced on load and repaired rather than rejected:

| Invariant                     | Repair when violated                                 |
| ----------------------------- | ---------------------------------------------------- |
| No object is its own parent   | Detach to root                                       |
| Every `parentId` resolves     | Detach to root                                       |
| No parent cycles              | Break deterministically — lowest `ObjectId` detaches |
| Frames contain finite numbers | Reset the offending components                       |
| Map key matches `object.id`   | Trust the storage key                                |

Cycle-breaking is deterministic so that two clients repairing the same corrupted
document independently reach the same result — which matters the moment
collaboration exists, because concurrent reparenting is the one corruption that
last-writer-wins cannot prevent.

---

## Next

- [04 · Object type registry](04-object-type-registry.md) — how types are added
- [06 · Schema and migrations](06-schema-and-migrations.md) — how the model evolves
