# Appendix A · Technology decisions

← [Documentation index](../README.md)

Every substantial dependency, why it is here, and what it would cost to replace.
Versions were verified against the npm registry on **2026-09-17**.

---

## Dependency policy

1. Do not take a package for what a few lines of stable code can do.
2. Do not reimplement genuinely hard infrastructure (CRDTs, compilers) to avoid a
   dependency.
3. Every runtime dependency of `packages/core` must be justified in this file.
   There are exactly two.

---

## Runtime dependencies

### `zod@4.6.5` — MIT

**Solves:** runtime validation at untrusted boundaries — persisted documents,
imports, and later API, MCP and AI output.
**Why not build it:** types vanish at runtime. Hand-written guards for every
object type and every migration is precisely the unmaintainable code a schema
library exists to remove. Zod also gives one source of truth per type via
`z.infer`.
**Coupling:** low-moderate. Schemas are declarative and confined to registry
definitions and `core/schema`.
**Replacement:** Valibot or ArkType; mechanical but touches every type definition.

### `fractional-indexing@4.0.0` — CC0

**Solves:** generating sort keys strictly between two neighbours.
**Why not build it:** ~150 lines with genuinely subtle edge cases — base-62
midpoint generation, boundary handling, concurrent-insert jitter. This is the
rare case where a tiny dependency beats reimplementation.
**Coupling:** none. The string format is the contract.
**Replacement:** CC0 means it can simply be vendored if it goes stale.

### `react@19.3.0` / `react-dom@19.3.0` — MIT

**Scope:** `apps/web` only. `packages/core` cannot import it — enforced in CI.
**Replacement:** would mean rewriting the view layer, not the product.
See [ADR 0001](../adr/0001-frontend-runtime-vite-react-spa.md).

### `zustand@5.0.15` — MIT

**Solves:** transient interaction state — tool, selection, hover, drag, viewport.
**Why not build it:** the document store is already ~120 lines of custom store
code; writing a second one to save 1.2 KB would be misapplied purity.
**Why not for the document:** it lives in `core`, which cannot depend on a
React-oriented library — and Zustand's selector model re-runs every subscriber on
every change, which is O(objects) per pointer-up.
**Caveat:** selectors must return primitives or stable references. See
[ADR 0005](../adr/0005-state-ownership.md).

---

## Build and test

| Tool                           | Version          | Why                                                                               |
| ------------------------------ | ---------------- | --------------------------------------------------------------------------------- |
| `typescript`                   | **6.0.3**        | Not 7.x — see [ADR 0010](../adr/0010-typescript-6-until-ts71.md)                  |
| `vite`                         | 8.3.0            | Client-heavy app; reads core's TS source directly, so no inter-package build step |
| `vitest`                       | 5.0.1            | Shares Vite's transform pipeline — one config. Core tests run in ~0.5s            |
| `@playwright/test`             | 1.63.0           | The only realistic way to test pointer-driven canvas interaction                  |
| `eslint` + `typescript-eslint` | 10.10.0 + 8.70.0 | Type-aware rules, and boundary enforcement via `no-restricted-imports`            |
| `prettier`                     | 3.9.7            | Formatting is not worth discussing                                                |
| `dependency-cruiser`           | 18.3.1           | Turns the architecture diagram into a CI check                                    |
| `pnpm`                         | 10.33.0          | Strict `node_modules` is what makes the core/web package boundary real            |
| `fake-indexeddb`               | 6.x              | Lets the real IndexedDB adapter be tested in Node                                 |
| `tsx`                          | 4.x              | Runs the benchmark generator                                                      |

---

## Deliberately not used

| Not used                | Why                                                     | When to revisit                              |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------- |
| Any canvas SDK          | [ADR 0002](../adr/0002-canvas-engine-custom-dom-svg.md) | If Phase 2 shows interaction work dominating |
| `next`                  | No SSR value; couples app to framework                  | If server rendering becomes valuable         |
| `tailwindcss`           | Not enough UI to justify a system                       | When style duplication becomes real          |
| Any component library   | Premature design system                                 | ~20 distinct components exist                |
| `immer`                 | Patches already produce structurally-shared copies      | If manual copying becomes error-prone        |
| `idb`                   | Four operations; one `promisify` helper covers it       | If IndexedDB usage grows substantially       |
| `@tanstack/react-query` | No server to query                                      | First server data fetch                      |
| `yjs`                   | [ADR 0007](../adr/0007-collaboration-yjs-deferred.md)   | Phase 4                                      |
| `rbush` / `flatbush`    | Linear culling is adequate; the port exists             | When profiling says so                       |
| `nanoid`                | 12 lines using the platform CSPRNG                      | Never, realistically                         |

---

## Notes on ecosystem health

Checked at decision time, and worth re-checking before adopting:

- `partykit@0.0.115` — last published **2025-05-21**. Effectively stale.
- `@y-sweet/sdk@0.9.1` — last published **2025-09-16**. A year old.
- `y-websocket@3.1.0` and `@hocuspocus/server@4.7.0` — current.
- `@excalidraw/excalidraw@0.18.1` — last published 2026-04-20.
- `rbush@4.0.1` — 2024, but stable and feature-complete.

This is why transport choice is a
[deferred decision](d-deferred-decisions.md) rather than a recommendation:
two options that would have been natural suggestions had gone stale between the
plan and the build.
