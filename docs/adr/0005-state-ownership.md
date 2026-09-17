# ADR 0005 · Three state homes, no global store

**Status:** Accepted · 2026-09-17

## Context

A canvas application has at least four kinds of state with genuinely different
lifetimes: persistent board content, transient interaction state, ephemeral
presence, and server/application data. Collapsing them into one store is the
common failure mode — and it makes persistence, undo and multiplayer each
incorrect in a different way.

## Decision

| State                        | Home                    | Mechanism                              |
| ---------------------------- | ----------------------- | -------------------------------------- |
| Persistent board content     | `core` `DocumentStore`  | Custom store, per-object subscriptions |
| Transient interaction        | `web` interaction store | Zustand                                |
| Presence _(later)_           | Presence adapter        | Yjs awareness                          |
| Server/application _(later)_ | Query cache             | TanStack Query                         |

The full matrix is in [State ownership](../architecture/02-state-ownership.md).

## Alternatives considered

**One global store for everything.** Named in the brief as an anti-pattern, and
correctly: board state needs undo and persistence, interaction state needs
neither, presence needs to be _dropped_ on disconnect. Different rules, different
homes.

**Zustand for the document too.** Rejected on two grounds. The document store must
live in `core`, which cannot depend on a React-oriented library. And Zustand's
selector model re-runs every subscriber's selector on every change — O(objects)
work per pointer-up at board scale.

**React Context for the document.** Any change re-renders every consumer. Fatal
for a canvas.

**`useState` lifted to a provider.** The disposable-prototype pattern the brief
forbids.

## Consequences

- The document store is ~120 lines of custom code. It earns that by keying
  notifications `Map<ObjectId, Set<listener>>`, so moving one object wakes exactly
  one component.
- Zustand selectors **must return primitives or stable references**. Returning a
  fresh object loops `useSyncExternalStore` forever — this crashed the app during
  development and is now documented in [`CLAUDE.md`](../../CLAUDE.md).
- Selection lives in interaction state, so it is never persisted and never
  appears in undo. When multiplayer arrives it is _projected_ onto presence, not
  moved there.
