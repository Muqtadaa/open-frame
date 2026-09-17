# ADR 0003 · Flat object map, fractional ordering, token styles

**Status:** Accepted · 2026-09-17

## Context

The board document is the most expensive thing in the system to change: it exists
in users' storage, it is what migrations transform, and it is what collaboration
will merge. Three sub-decisions within it are effectively irreversible.

## Decision

### Objects live in a flat map, not a tree

```ts
objects: ReadonlyMap<ObjectId, AnyOpenFrameObject> // hierarchy via parentId + order
```

### Sibling order is a fractional index string, not an integer z-index

```ts
type OrderKey = Brand<string, 'OrderKey'> // "a0" < "a0V" < "a1"
```

### Style is a sparse record of design tokens, not raw values

```ts
{ color?: 'yellow' | 'blue' | …, fill?: …, opacity?: number }
```

## Alternatives considered

**A literal tree.** Easier to read and worse everywhere else: subtree moves
become deep rewrites, lookups become traversals, and trees merge badly under
concurrent editing. A flat map with parent pointers needs only a cycle check —
and that checker is already written and tested.

**Integer z-index.** The obvious choice, and it forces renumbering every sibling
on reorder. That inflates undo entries, persistence writes and network messages,
and under concurrent editing two users reordering at once clobber each other.

**Per-type style blobs.** Would make "colour the selection" impossible without
switching on object type — the anti-pattern the registry exists to prevent.

**Raw colour values (`#ffe57f`).** Bakes one visual design into every document
ever saved, makes theming impossible, and makes "make this red" inexpressible as
an AI command.

**An `updatedAt` / `updatedBy` on every object.** Explicitly rejected. Stamping a
shared field on every mutation turns every edit into a write to contended state,
manufacturing merge conflicts between users who touched unrelated properties, and
inflating patch volume for data nothing in the render path reads. Board-level
"last modified" is derived at the persistence layer instead.

## Consequences

- Reordering writes one object. Measured key growth is ~1 character per 6 inserts
  between the same neighbours; the rebalance threshold is reached after ~230 —
  detected, not prevented ([risk R5](../appendices/c-risks.md)).
- Cycle-freedom must be actively defended. `wouldCreateCycle` guards reparenting;
  `repairDocument` breaks cycles deterministically on load and, later, on merge.
- Connector paths are **derived**, never stored, so moving an object never
  cascades writes.
- The model is already CRDT-shaped, which is why
  [collaboration](../architecture/09-collaboration.md) is a design document rather
  than a redesign.
