# ADR 0001 · Vite + React SPA, not Next.js

**Status:** Accepted · 2026-09-17

## Context

OpenFrame is an infinite-canvas application. Essentially all of its behaviour —
pan, zoom, selection, dragging, hit testing, rendering — is client-side and
depends on pointer input and element measurement. It will eventually need a
server for accounts, collaboration and an API, but does not need one now.

## Decision

Build `apps/web` as a **Vite 8 + React 19 single-page application**. Add a
separate server application later if and when one is needed.

## Alternatives considered

**Next.js 16.** Its value is server rendering, file-based routing, and server
actions. The canvas gets nothing from server rendering — it cannot render
meaningfully without a viewport — and SSR actively complicates a renderer that
depends on `window`. Adopting it now would couple the whole product to a
framework we would later want to split from the API anyway.

**Svelte or Solid.** Better rendering ergonomics for this kind of workload and
genuinely tempting. Rejected on ecosystem size for the surrounding application
(component libraries, testing, hiring) — and because React is confined to
`apps/web` regardless, so this is a reversible choice about one package rather
than about the product.

**Astro / MPA.** Wrong shape entirely for a stateful single-surface app.

## Consequences

- No SSR. The app ships as static files and can be hosted anywhere.
- A server application will be a **sibling** in the workspace, not a
  reorganisation of this one.
- React is a dependency of `apps/web` only. `packages/core` cannot import it —
  enforced in CI.
- Routing is deferred until there is more than one route
  ([Deferred decisions](../appendices/d-deferred-decisions.md)).
