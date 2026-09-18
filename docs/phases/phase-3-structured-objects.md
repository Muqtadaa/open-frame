# Phase 3 · Structured objects

**Status: Complete** · ← [Roadmap](README.md)

The phase where OpenFrame stops being a whiteboard.

---

## The point

Everything before this produces a competent canvas. This is where the canvas
starts carrying meaning:

```ts
{ type: 'evidence',
  data: { text: 'Participants skipped the pricing page entirely',
          source: 'September usability study',
          participant: 'P07',
          tags: ['pricing', 'comprehension'] } }

// The link is its own object, not a field on either end — see ADR 0011.
{ type: 'relation',
  data: { from: 'obj_insight_42', to: 'obj_evidence_7', predicate: 'cites' } }
```

Still a normal canvas object — draggable, selectable, styleable, undoable — and
also a research artefact that can be queried, filtered, summarised and linked.

---

## Scope

### Object types

`evidence`, `insight`, `hypothesis`, `experiment`, `decision`, `task`,
`journey-stage`, `requirement`.

Each is a folder in `packages/core/src/types/`, a folder in
`apps/web/src/canvas/views/`, and two registration lines. If any of them requires
touching the command layer, persistence or the renderer, **something is wrong
with the registry** and that is the bug to fix first.

### Capabilities the registry will need to grow

Phase 1's `ObjectCapabilities` covers geometry and styling. Structured objects
will likely need:

- a **field schema for the inspector**, so a generic panel can edit any type
- **relationship declarations**, so links can be validated and traversed
- **type-level affordances** — which types can convert into which others
  (evidence → insight)

These are registry additions, not application changes. Designing them is the
main architectural work of this phase.

All three shipped, as `fields`, `derivations` and `promotions`. The distinction
that took the longest to see: a **promotion** turns an object INTO another
("this was always evidence"), a **derivation** creates something new standing on
it ("here is a claim that cites it"). Conflating them would mean the evidence
vanished at the moment it started being cited.

`derivations` is also where ADR 0011's deferred predicate vocabulary settled.
The pairings — `cites`, `derivesFrom`, `tests`, `informs`, `implements`,
`motivates` — are declared beside the types they join rather than chosen at each
call site.

The second is **decided**: [ADR 0011](../adr/0011-relations-as-objects.md). A
relation is an object, `spatial: false` keeps it off the board, and a memoized
index answers the reverse lookup. What the ADR deliberately left open —
whether the predicate vocabulary is closed, and whether the registry validates
which types may relate to which — waits until the real pairings exist.

### Features these unlock

Board search (via `describe().searchText`, which already exists), filter by tag
or type, an inspector panel driven by field schemas, and conversion flows
(select evidence → create insight linked to it) built as `transact` composites.

---

## The relationship decision, finally forced

Phase 1 deliberately deferred this
([Deferred decisions](../appendices/d-deferred-decisions.md)). Links currently
live in `data` as `ObjectId[]`, which works until something asks:

> _"Which insights cite this piece of evidence?"_

A reverse lookup over every object's `data` does not scale, and a first-class
edge model is a significant change to the document, migrations and collaboration.
**This phase is where the information to decide finally exists** — and where an
ADR gets written. It now is:
[ADR 0011 · Relations are objects, not fields](../adr/0011-relations-as-objects.md),
rejecting the embedded array on merge behaviour rather than on query cost.

---

## Done when

- ✅ A researcher can run a synthesis session end to end: capture evidence,
  cluster it, promote clusters to insights, link insights to hypotheses. The
  whole spine — note → insight → hypothesis → experiment → decision → task —
  is walked by one e2e test, asserted as a PATH so a dropped link fails
  somewhere rather than quietly ceasing to be offered.
- ✅ Adding a ninth structured type is genuinely a two-file change. Six types
  were added at once to check it: a folder in `core/src/types/`, a file in
  `web/src/views/`, and two registration lines each. Nothing in the command
  layer, persistence, undo, culling, hit testing or search learned they exist.
- ✅ Board search finds objects by their semantic fields, not only their text —
  reading `describe()`, which every type had declared since Phase 1 and which
  nothing consumed until now.

## What is deliberately not here

- **The status vocabularies are a first cut.** `todo/doing/done/blocked`,
  MoSCoW, `proposed/accepted/superseded` are the schemes these users already
  argue in, but none has met a real session. Changing one is a migration, which
  is the intended friction.
- **Nothing validates which types may relate to which.** `derivations` says what
  is OFFERED; a relation between any two objects is still legal, because the
  first person to want an unusual one is more likely to be right than the
  registry is.
- **No filtering by field value beyond tag and type.** `status:done` is an
  obvious next term and was left out: a query language grows a parser, and this
  grammar still fits in a placeholder string.

---

## Next

[Phase 4 · Collaboration](phase-4-collaboration.md)
