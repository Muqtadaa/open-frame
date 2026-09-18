# ADR 0011 · Relations are objects, not fields

**Status:** Accepted · 2026-09-18

## Context

[Phase 3](../phases/phase-3-structured-objects.md) introduces object types that
refer to each other: an `insight` cites `evidence`, a `hypothesis` derives from
an `insight`, an `experiment` tests a `hypothesis`. Phase 1 deliberately left the
mechanism undecided ([Appendix D](../appendices/d-deferred-decisions.md)) and
named the question that would force it:

> _"Which insights cite this piece of evidence?"_

That question is not optional. It is how a synthesis board proves provenance,
which [`PRODUCT.md`](../../PRODUCT.md) names as the product's purpose: "you can
point at an insight and see the evidence under it".

Three prior decisions constrain the answer before any new reasoning starts.

**A `Patch` addresses an `ObjectId`.** The change format has three operations —
`add`, `remove`, `set` — each naming one object. Anything that is not an object
cannot be written through the command layer without widening that format, and
[ADR 0004](0004-command-mutation-architecture.md) makes the command layer the
only mutation path. This is not hypothetical: `BoardDocument.assets` is exactly
such a side table, and images had to store their whole `AssetRef` inline because
that map is unreachable from a command.

**[ADR 0007](0007-collaboration-yjs-deferred.md) already chose to shape the
document for merge.** Its three irreversible decisions were a flat object map,
fractional ordering, and nothing written during a drag — each chosen because it
merges cleanly. `PRODUCT.md` then raised multiplayer from a planned feature to
part of the product's identity.

**Behaviour that varies by type lives in the registry** ([CLAUDE.md](../../CLAUDE.md)
rules 5, 16, 18). A relation model that requires callers to know which types
relate to which is the `switch (object.type)` those rules exist to prevent.

## Decision

**A relation is an object.** A `relation` type carries `from`, `to` and a
`predicate`, has no geometry, and is created, deleted and undone through the same
commands as everything else.

```ts
{ type: 'relation',
  data: { from: 'obj_evidence_7', to: 'obj_insight_42', predicate: 'cites' } }
```

Two supporting pieces follow from it, and are part of this decision rather than
later additions:

**A `spatial: false` capability.** Every existing object occupies the board. A
relation does not, and an object with no place on it must be excluded from paint
order, culling, hit testing and marquee selection — otherwise dragging a marquee
across a region silently selects invisible relations, and deleting that selection
silently destroys them. Following rule 18, this is a capability every type
declares rather than a check for `type === 'relation'`.

**A memoized relation index on the registry.** Reverse lookup is one pass over
the document producing *every* relation grouped both ways, cached on document
identity — the same shape as `#childIndexFor`, added when a group's bounds turned
culling quadratic. The document is immutable and replaced wholesale on each
change, so identity is an exact invalidation key. Queries are then O(1); the pass
is O(n) once per document version, not once per query.

## Alternatives considered

**Embedded ids — `insight.data.citesEvidenceIds: ObjectId[]`.** The status quo,
and the cheapest thing to build. Rejected on merge behaviour, which is the one
axis this project has already committed to.

A patch that changes an array is `set` on `['data','citesEvidenceIds']` with the
whole new array as its value. Two people adding a different citation to the same
insight concurrently produce two whole-array writes, and one of them loses a
citation that was never in conflict. That is precisely the failure ADR 0007's
flat-object-map decision was taken to avoid, reintroduced one level down. With
relations as objects the same two edits are two `add` operations on different
objects, which commute.

Reverse lookup is the second problem and the one the deferral named. It would be
solvable — the registry could declare `relations(object)` the way it declares
`dependencies(object)`, and the index above could be built from that. So this
alternative fails on merge, not on queries.

**An `edges` map on `BoardDocument`.** The textbook graph model, and the shape
most people would reach for. Rejected because `Patch` addresses an `ObjectId`, so
every edge write would need a widened change format — new operations that the
collaboration adapter, `invertPatches`, serialization and the patch-symmetry
property test would then carry forever. The assets map already demonstrated the
cost of a side table the command layer cannot reach.

**Reuse `connector`.** Tempting, because a connector already has `from`, `to`,
attachment and orphan handling, and drawing a line between two objects is how a
person would *express* a relation. Rejected because the two are different things
that happen to look alike.

A connector is a drawn line: it has routing, arrowheads, a stroke, and endpoints
that attach at an anchor *on* a shape's edge. A relation has no appearance at
all — an insight may cite forty pieces of evidence without anyone wanting forty
lines on the board, and two objects may be joined by a line that means nothing.
Conflating them forces one of two lies: relations you cannot create without
drawing, or connectors carrying a `predicate` that most of them do not have.

They can still meet at the product level — drawing a connector between an
`evidence` and an `insight` may offer to create the citation — but that is a
command composing two objects, not one object serving two purposes.

**Deciding nothing and shipping Phase 3's types with embedded ids.** Rejected.
The types are the phase; retrofitting the relation model after eight of them
exist means eight migrations rather than none.

## Consequences

**A duplicate relation is possible and benign.** Two people adding the same
citation concurrently yields two relation objects. They are deduplicated on read
by `(from, to, predicate)`; nothing is lost, which is the property that matters.
Contrast the embedded array, where the same race loses data.

**Deleting an object orphans its relations.** The connector already solved this
shape — `detach.ts` converts an orphaned end to a free point, and deletes the
connector when both ends go. A relation has no free-point equivalent: a citation
of nothing is not a citation, so a relation is deleted when either end is. This
must be one transaction with the delete, or undo restores the object without its
citations.

**Relations are invisible, and invisible things need a way to be seen.** Phase 3
owes at least one surface that makes them legible — a provenance view on the
inspector answering "what cites this?" — or the model is unfalsifiable by use.

**`spatial: false` is a breaking capability addition.** All nine existing types
must declare it, which is the intended friction (rule 18).

**Relation count grows faster than object count.** A board of 500 evidence items
clustered into 40 insights may carry more relations than objects. The index above
is what keeps that from mattering, and `pnpm bench:cull` is where it gets checked
rather than assumed — with a fixture that contains relations, because a fixture
of one object type measures one object type (rule 10).

## What this does not decide

- **The predicate vocabulary.** Whether `cites` is a closed enum, a per-type
  declaration, or free text is a Phase 3 product question, not a model question.
- **Whether relations are typed by their endpoints.** Whether the registry
  validates that only an `insight` may `cite` `evidence` is deferred until the
  eight types exist and their real pairings are known.
- **Visual expression.** Whether a relation ever draws itself, and how a
  connector and a relation are offered together, belongs to the surface work.
