# Phase 3 · Structured objects

**Status: Planned** · ← [Roadmap](README.md)

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
          tags: ['pricing', 'comprehension'],
          linkedInsightIds: ['obj_insight_42'] } }
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
ADR gets written.

---

## Done when

- A researcher can run a synthesis session end to end: capture evidence, cluster
  it, promote clusters to insights, link insights to hypotheses.
- Adding a ninth structured type is genuinely a two-file change.
- Board search finds objects by their semantic fields, not only their text.

---

## Next

[Phase 4 · Collaboration](phase-4-collaboration.md)
