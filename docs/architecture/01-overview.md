# 01 · Architecture overview

← [Documentation index](../README.md)

---

## The shape of the system

OpenFrame is a **modular monolith with a pure core and replaceable adapters**,
spread over five workspaces and three outside services.

```
                       DEPENDENCY DIRECTION: always downward

  apps/web (browser)              apps/mcp (stdio process)      apps/rooms (Worker)
  ┌───────────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
  │ ui/  interaction/  canvas/│   │ tools/  read, write   │   │ Worker: routes only  │
  │ app/ (composition root)   │   │ supabase/  sign-in    │   │ BoardRoomObject:     │
  │ adapters/ indexeddb,      │   │ board.ts  one room    │   │  one per board, holds│
  │   memory, room, supabase  │   │                       │   │  the Y.Doc, decides  │
  └─────────────┬─────────────┘   └──────────┬───────────┘   │  who may write       │
                │                            │               └──────────┬───────────┘
                └──────────────┬─────────────┴───────────────────────────┘
                               ▼
              packages/collab — the board on Yjs: document mapping,
              room protocol (BoardRoom), session, change log
                               │
                               ▼
              packages/core — pure TypeScript; deps: zod, fractional-indexing
                commands/ → domain/ → geometry/     schema/     ports/     store/

  Outside services
    Supabase         accounts, the board list, membership, workspaces, comments
                     (never a board's contents)        ← apps/web, apps/mcp
    Durable Object   each board's shared document, as snapshot + updates
                     storage                           ← apps/rooms
    R2               images on shared boards           ← apps/rooms
```

Inside `apps/web` the layers are the same as they always were:

```
  ui/          Toolbar, panels, status bar. May READ the document; never mutates it.
    ▼
  interaction/ Tools, pointer decisions, selection, drag deltas.
               Owns transient state. Dispatches commands on commit.
    ▼
  canvas/      Viewport, culling, hit testing, object views. No persistent state.

  adapters/    IndexedDB and memory repositories, the room client, Supabase.
               Implement ports declared in core. Reached by the interface only
               through runtime/services.ts.
```

Every caller of the domain goes through the same dispatcher with a different
origin: a person (`user`), a collaborator's merged edit (`remote`) and an agent
over MCP (`mcp`), and in-app AI (`ai`), which applies a reviewed clustering as
one change. An HTTP API, when it comes, joins that list.

## Package boundaries

A package boundary is worth its cost where it stops a dependency that matters.
Each of the four libraries and services below is one, and the web app is what
is left:

| Workspace         | Exists so that…                                                    | May depend on                           |
| ----------------- | ------------------------------------------------------------------ | --------------------------------------- |
| `packages/core`   | the domain cannot import React, a database or a CRDT               | `zod`, `fractional-indexing`            |
| `packages/collab` | Yjs is in exactly one place, shared by the browser, room and agent | `core`, `yjs`, `y-protocols`, `lib0`    |
| `apps/rooms`      | the Cloudflare runtime stays out of everything else                | `core`, `collab`                        |
| `apps/mcp`        | an agent's process never loads the web app                         | `core`, `collab`, the MCP SDK, Supabase |
| `apps/web`        | (the application)                                                  | `core`, `collab`, React, Supabase       |

Under pnpm a package can only import what it declares, so the first line is
enforced by the package manager. The rest are rules in
`.dependency-cruiser.cjs`, among them `core-is-pure`, `yjs-lives-only-in-collab`,
`cloudflare-lives-only-in-rooms`, `supabase-lives-only-in-adapters`,
`mcp-does-not-depend-on-the-web-app` and `collab-does-not-depend-on-apps`.

[ADR 0009](../adr/0009-repository-structure-two-packages.md) started with two
packages and named the triggers for a third; collaboration, the room server and
the agent were those triggers.

## Module contracts

| Module            | Responsibility                                | May depend on                    | Must never contain                              |
| ----------------- | --------------------------------------------- | -------------------------------- | ----------------------------------------------- |
| `core/geometry`   | Pure math on plain objects                    | nothing                          | Rendering, React, document knowledge            |
| `core/domain`     | Document model, registry, patches, invariants | `geometry`                       | React, DOM, IO, canvas types, CRDT types        |
| `core/schema`     | Envelope, versions, migrations, validation    | `zod`, loose JSON                | Imports of _current_ domain types in migrations |
| `core/commands`   | Command types, dispatch, handlers, undo       | `domain`, `ports`, `store`       | React, direct IO, canvas types                  |
| `core/ports`      | Interfaces to the outside world               | domain types                     | Any implementation                              |
| `core/store`      | Document state and subscriptions              | `domain`                         | Business rules, IO                              |
| `web/adapters`    | IndexedDB, memory, the room, Supabase         | `core/ports`, `core/domain`      | Business rules, UI                              |
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
                    emit      ────────┘  subscribers persist and sync
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
