# 01 · Architecture overview

← [Documentation index](../README.md)

---

## The shape of the system

OpenFrame is a **modular monolith with a pure core and replaceable adapters**.

```
                       DEPENDENCY DIRECTION: always downward
  ┌──────────────────────────────────────────────────────────────────────┐
  │ apps/web                                                             │
  │                                                                      │
  │   ui/          Toolbar, banners, status bar                          │
  │     │          React. May READ the document. Never mutates it.       │
  │     ▼                                                                │
  │   interaction/ Tools, pointer decisions, selection, drag deltas       │
  │     │          Owns transient state. Dispatches commands on commit.  │
  │     ▼                                                                │
  │   canvas/      Viewport, culling, hit testing, object views          │
  │     │          Renders from the store. Owns no persistent state.     │
  │     │                                                                │
  │   adapters/    IndexedDbBoardRepository, MemoryBoardRepository       │
  │     │          [later] collaboration, presence, assets               │
  │     │          Implement ports declared in core.                     │
  └─────┼────────────────────────────────────────────────────────────────┘
        │  depends on ▼        (core NEVER depends on anything above)
  ┌─────▼────────────────────────────────────────────────────────────────┐
  │ packages/core   — pure TypeScript; deps: zod, fractional-indexing     │
  │                                                                      │
  │   commands/   Command types, dispatcher, handlers, undo              │
  │     │                                                                │
  │     ▼                                                                │
  │   domain/     BoardDocument, objects, registry, patches, invariants  │
  │     │                                                                │
  │     ├──► schema/    Envelope, versioning, migrations, validation     │
  │     └──► geometry/  Point, Rect, Viewport  (depends on NOTHING)      │
  │                                                                      │
  │   ports/      BoardRepository, AssetStore, Capabilities, Clock,      │
  │               IdGenerator, SpatialIndex  — interfaces only           │
  │   store/      DocumentStore (read) + DocumentWriter (write)          │
  └──────────────────────────────────────────────────────────────────────┘

  FUTURE CALLERS — siblings of apps/web, never of each other:
  apps/api  ──┐
  apps/mcp  ──┼──► core/commands ──► domain ──► ports
  ai/        ─┘        (same dispatcher, different origin tag)
```

## Why only two packages

A package boundary is worth its cost only where it prevents a dependency that
matters. Exactly one such boundary exists today: **core must not be able to
import React**. Under pnpm, core's dependency list simply does not contain it,
so the import fails to resolve — the rule is enforced by the package manager
rather than by memory.

Everything else is enforced more cheaply by `dependency-cruiser` rules over
folders. See [ADR 0009](../adr/0009-repository-structure-two-packages.md) for
the triggers that would justify a third package.

## Module contracts

| Module            | Responsibility                                | May depend on                    | Must never contain                              |
| ----------------- | --------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| `core/geometry`   | Pure math on plain objects                    | nothing                          | Rendering, React, document knowledge            |
| `core/domain`     | Document model, registry, patches, invariants | `geometry`                       | React, DOM, IO, canvas types, CRDT types        |
| `core/schema`     | Envelope, versions, migrations, validation    | `zod`, loose JSON                | Imports of _current_ domain types in migrations |
| `core/commands`   | Command types, dispatch, handlers, undo       | `domain`, `ports`, `store`       | React, direct IO, canvas types                  |
| `core/ports`      | Interfaces to the outside world               | domain types                     | Any implementation                              |
| `core/store`      | Document state and subscriptions              | `domain`                         | Business rules, IO                              |
| `web/adapters`    | IndexedDB, memory, later collaboration        | `core/ports`, `core/domain`      | Business rules, UI                              |
| `web/canvas`      | Render, cull, hit-test                        | `core`, `web/interaction`        | Persistent state, business rules                |
| `web/interaction` | Tools, transient state, dispatch              | `core/commands`, `core/geometry` | Direct document mutation, persistence           |
| `web/ui`          | Chrome                                        | `core` (read), `web/interaction` | Geometry, persistence, direct mutation          |

## What enforces this

Three mechanisms, in increasing order of coverage:

1. **ESLint `no-restricted-imports`** — immediate feedback in the editor.
2. **`packages/core/src/architecture.test.ts`** — fails `pnpm test`. Checks
   forbidden imports, Node built-ins in source, the declared dependency list,
   and `switch (object.type)` outside the registry.
3. **`.dependency-cruiser.cjs`** — fails `pnpm depcruise`. Covers the whole
   graph including transitive reach and circular dependencies.

All three are verified to actually fail when violated — a rule that passes
vacuously is worse than no rule, because it is trusted.

## The request path, end to end

Dragging three objects and releasing:

```
pointer events ─► interaction/  (transient delta, no document write)
                      │
              pointer-up
                      ▼
                 useCommands ─► CommandDispatcher.dispatch
                                      │
                    authorize ────────┤  Capabilities port
                    validate  ────────┤  handler rejects before any patch
                    mutate    ────────┤  pure handler → Patch[]
                    invert    ────────┤  generic inverse for undo
                    apply     ────────┤  DocumentWriter, one transaction
                    record    ────────┤  one undo entry
                    emit      ────────┘  subscribers persist / later sync
                                      │
                      ┌───────────────┴───────────────┐
                      ▼                               ▼
              DocumentStore notifies          BoardRepository saves
              only the 3 affected objects     (debounced, coalesced)
                      │
                      ▼
              canvas/ re-renders 3 components
```

Full detail in [Commands and undo](05-commands-and-undo.md).

## Next

- [02 · State ownership](02-state-ownership.md) — where each kind of state lives
- [03 · Document model](03-document-model.md) — what a board actually is
