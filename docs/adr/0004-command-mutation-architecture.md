# ADR 0004 · One command layer for all mutation

**Status:** Accepted · 2026-09-17

## Context

OpenFrame must eventually be mutated by the human UI, undo/redo, AI features, a
public API, an MCP server, importers and remote collaborators. If each grows its
own path into the document, they will diverge on validation, authorization,
history and persistence — and the divergence will be discovered as bugs.

## Decision

A single `CommandDispatcher`. Commands are **plain serializable data** carried in
an envelope that records `actor` and `origin`
(`user | ai | api | mcp | import | remote`).

Handlers are pure: `(document, command, context) → Patch[]`. They never mutate.
Inverse patches are derived generically, so undo is not implemented per command.

Mutation access is separated at the type level:

```ts
const { store, writer } = createDocumentStore(document)
```

`DocumentStore` has no mutating methods. `DocumentWriter` is held only by the
composition root, which gives it to the dispatcher and nothing else.

## Alternatives considered

**Direct store mutation from components.** The default in most React apps, and
the reason "clean it up later" never happens. Undo becomes impossible to retrofit.

**Redux-style reducers.** Similar shape, but couples the domain to a store
library and to React's update model. The dispatcher is ~150 lines and depends on
nothing.

**Event sourcing.** Rejected as premature enterprise architecture. The patch
stream already provides most of the benefit at a fraction of the cost.

**Adding `origin` later.** Considered and rejected — it would mean revisiting
every call site, and it turns out to serve three purposes at once: audit, AI
preview/rollback, and (via Yjs's origin-scoped `UndoManager`) collaborative undo.

## Consequences

- Undo correctness reduces to **one property**: apply-then-invert returns the
  exact prior document. Tested directly; every future command inherits it.
- A command that fails validation leaves the document provably untouched, because
  handlers produce no patches until every check passes.
- MCP and API become _callers_, not new subsystems.
- The rule **nothing is written during a drag** falls out naturally: one command
  per logical action, dispatched on commit.
- Business logic in a React component is now a reviewable defect rather than a
  matter of taste.
