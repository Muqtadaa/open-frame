# CLAUDE.md — engineering rules for OpenFrame

Durable rules only. Product context lives in [`docs/`](docs/README.md); start at
[architecture/01-overview.md](docs/architecture/01-overview.md).

---

## Commands

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm verify       # typecheck + lint + depcruise + test + build  ← run before every commit
pnpm test         # unit + integration (~1s)
pnpm test:e2e     # Playwright; set OPENFRAME_CHROMIUM_PATH if the sandbox ships its own Chromium
pnpm bench:fixtures   # generate 100/1k/5k/10k boards into apps/web/public/bench/
pnpm test:bench       # renderer scaling probe (needs the fixtures above)
pnpm build:bench      # deployable build WITH the bench panel and fixtures
```

## Layout

```
packages/core   Pure TypeScript domain. Deps: zod, fractional-indexing. Nothing else.
apps/web        React app: canvas, interaction, UI, adapters.
```

---

## The rules

### 1. `packages/core` stays pure

No React, no DOM, no database, no CRDT, no AI provider, no `node:` imports in
source. Enforced by ESLint, `architecture.test.ts` and `.dependency-cruiser.cjs`.

Adding a runtime dependency to core requires updating the allowlist assertion in
`architecture.test.ts` — that friction is intentional.

### 2. Dependencies point inward

```
ui → interaction → canvas → commands → domain → geometry
                            adapters → ports
```

`ui`, `canvas` and `interaction` must never import from `adapters`. Nothing in
`core` may import from `apps`. No cycles.

### 3. All persistent mutation goes through `CommandDispatcher.dispatch`

There is no second path. Not from a component, not from a hook, not from an
adapter, and later not from AI, the API or MCP.

`DocumentWriter` is held **only** by the composition root. If you find yourself
wanting it elsewhere, the change belongs in a command handler.

### 4. Nothing is written to the document during a drag

Gestures update interaction state only. **One command on commit.**

This is why a 500-event drag is one undo entry, one save and (later) one network
message. Breaking it breaks undo granularity, multiplayer semantics and
performance simultaneously.

### 5. Object behaviour lives in the registry, never in `switch (object.type)`

`switch (object.type)` outside the registry fails the build. If behaviour varies
by type, add it to `ObjectTypeDefinition` (pure) or `ObjectViewDefinition`
(React) — never to a caller.

### 6. Migrations never import current domain types

A migration declares its own local input and output shapes and operates on
`unknown`. Importing today's types makes a migration silently change meaning when
those types change. Migrations are pure, forward-only, and never edited once
shipped. Ship a frozen fixture with each one.

### 7. Never write back a document you could not fully read

A quarantined board opens read-only and autosave is **never** attached. Losing a
user's work is the one unacceptable failure.

### 8. Validate at boundaries, not in hot paths

Load, import, API, MCP, AI output, and arbitrary payloads such as
`UpdateObjectData`. Never in the render path; never on trusted internal objects.

### 9. Zustand selectors must return primitives or stable references

```ts
useInteractionStore((s) => ({ dx: s.drag.dx })) // ✗ infinite render loop
useInteractionStore((s) => s.drag.dx) // ✓
```

A fresh object never compares equal under `Object.is`, so
`useSyncExternalStore` re-renders forever. This crashed the app once.

### 10. Never call an O(n) document helper once per object

`childrenOf` scans the whole document. Calling it per object makes a render pass
O(n²) — on a flat 10,000-object board that was ~100 million iterations and 600ms
frame spikes. Use `groupByParent` when you need every container's children.

Anything that runs per frame gets measured with `pnpm test:bench`, not assumed.

### 11. `OPENFRAME_BENCH` decides what a deployment ships

`vercel.json` runs `build:bench` when `OPENFRAME_BENCH=1` and the clean `build`
otherwise. A bench build carries the dev panel and ~4.7MB of benchmark boards.

**This guard is manual.** While that variable is set in Vercel, _every_
deployment in that environment carries the bench payload — production included.
Remove it once the renderer question (ADR 0002) is settled, and do not set it on
an environment real users reach.

### 12. Nothing goes in `apps/web/public/`

Vite copies that directory into every production build. Benchmark fixtures once
lived there and would have shipped 4.7MB to users. Assets that belong in some
builds but not others go through an explicit Vite plugin, and the guard that
enables them must be a compile-time literal (`define`), not a runtime env
lookup — otherwise the branch stays live and the code ships anyway.

### 13. Break a new architectural rule once, and watch it fail

A rule that passes vacuously is worse than no rule, because it is trusted. This
practice has already caught a dependency-cruiser rule that never fired on the
mistake it existed to catch.

---

## Conventions

**Naming** — `ObjectId`/`BoardId`/`AssetId` are branded; use `asObjectId()` only
at deserialization boundaries and in tests. `frame` is an object's geometry;
`Viewport` is the camera. `OrderKey` is a string, never parsed as a number.

**Types** — no `any`, ever; `unknown` plus narrowing instead. Interface members
that hold functions use property syntax (`readonly create: (…) => …`) rather than
method shorthand, because methods are bivariant and properties are not.

**Files** — one object type per folder in `core/src/types/` and
`web/src/canvas/views/`. Components stay small; if `Canvas.tsx` starts growing
state or geometry, extract it.

**Ports** — `Clock` and `IdGenerator` are injected, so tests are deterministic
without fake timers or mocks. Use `createTestHarness()` from `core/src/testing.ts`.

**Comments** — explain _why_, especially where a non-obvious choice prevents a
specific failure. Do not narrate what the code already says.

---

## Adding an object type

1. `packages/core/src/types/<name>/schema.ts` — Zod schema and TS type
2. `packages/core/src/types/<name>/definition.ts` — `defineObjectType({...})`
3. Register in `packages/core/src/types/index.ts` — one line
4. `apps/web/src/canvas/views/<Name>View.tsx` — `defineObjectView({...})`
5. Register in `apps/web/src/canvas/views/index.ts` — one line

Nothing else should need to change. If it does, that is the bug — fix the
registry, not the caller. See
[docs/architecture/04-object-type-registry.md](docs/architecture/04-object-type-registry.md).

---

## Adding a command

1. Add to the `Command` union in `commands/types.ts`
2. Add a case to `describeCommand` in `commands/labels.ts`
3. Write a pure handler in `commands/handlers/` returning `Patch[]` only
4. Add a case to `handleCommand` in `commands/handlers/index.ts`
5. Test the happy path, rejection paths, and locked-object behaviour

Undo comes free — inverse patches are derived generically and covered by the
patch-symmetry property test.

---

## Before you commit

`pnpm verify` must pass. If you touched interaction or rendering, run
`pnpm test:e2e` too — it catches the class of bug unit tests structurally cannot.
