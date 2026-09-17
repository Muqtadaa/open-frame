# ADR 0006 · IndexedDB behind a patch-aware port

**Status:** Accepted · 2026-09-17

## Context

Phase 1 needs boards to survive a reload. It does not need a server, accounts, or
any infrastructure a developer has to run locally. But the persistence _shape_
chosen now determines how expensive a server is later.

## Decision

A `BoardRepository` port in `core`, with two implementations in `apps/web`:
IndexedDB and in-memory.

The port includes `applyPatches(id, patches)` **from day one**, even though the
IndexedDB adapter satisfies it by read-modify-write.

## Alternatives considered

**Whole-document save only.** Simpler, and it bakes "rewrite the entire board on
every change" into every call site. When a real database arrives — where that is
not an option — the change stops being a new class and becomes a rewrite. The
cost of having `applyPatches` now is a few lines; the cost of adding it later is
the call sites.

**The `idb` wrapper library.** Pleasant, and the surface we need is four
operations. The dependency policy says not to take a package for what a few lines
of stable code can do. One `promisify` helper covers the verbosity.

**localStorage.** Synchronous, string-only, ~5MB. A 10,000-object board is 3MB
serialized. Not viable.

**Starting with a server.** Would mean building auth, hosting and a schema before
knowing what the product needs, and would make local development require
infrastructure.

## Consequences

- `pnpm dev` is the entire setup. No Docker, no services, no accounts.
- Both adapters are verified by **the same test suite** via `describe.each`, so a
  future Postgres adapter gets an executable specification rather than prose.
- Autosave attaches to the **command stream**, not to React, and is coalesced.
- The cardinal rule is enforced here: a quarantined board never gets autosave
  attached, so a document that could not be read is never overwritten.
- "Last modified" is derived at this layer, which is why it is deliberately
  absent from the document model ([ADR 0003](0003-canonical-document-model.md)).
