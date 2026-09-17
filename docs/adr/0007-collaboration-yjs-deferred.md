# ADR 0007 · Yjs, designed now, built later

**Status:** Accepted (deferred) · 2026-09-17

## Context

Multiplayer editing is a core long-term requirement. It is also the single
largest source of constraints on the document model — and retrofitting it is
expensive, while building it now would be premature for a product with no users.

## Decision

**Do not implement collaboration.** Instead:

1. Choose the likely technology (Yjs) so the document model can be shaped for it.
2. Make the three decisions that are expensive to reverse.
3. Leave transport, topology and undo semantics explicitly undecided.

The three decisions, already made:

- **Flat object map** — CRDTs merge trees badly.
- **Fractional ordering** — a reorder is a one-object write that merges cleanly.
- **Nothing written during a drag** — in-flight gestures are presence, not
  document history.

Plus two supporting ones: `origin` on every command envelope, and `skipUndo` on
dispatch. Both already exist and are tested.

## Alternatives considered

**Yjs.** MIT, ~920k weekly downloads, largest provider ecosystem, 10–50× faster
than Automerge on large documents. The pragmatic default.

**Loro (`loro-crdt@1.16.1`).** Faster still, smaller encoding. Early ecosystem —
every integration would be bespoke. Wrong trade for a solo developer.

**Automerge (`@automerge/automerge@3.5.0`).** Strong at Git-like history, which
OpenFrame does not need as a product feature.

**Building it now.** Rejected. It would double Phase 1 scope for a product with
no second user.

**Deciding nothing.** Also rejected — the document model choices above are
genuinely irreversible, and making them blind would likely make them wrong.

## Consequences

- The domain remains comprehensible without knowing CRDT internals, and no Yjs
  type may reach `core`, `interaction` or `ui`. `Y.Doc` will appear in exactly
  one directory, enforced by `dependency-cruiser`.
- Patches are OpenFrame's own format precisely so the adapter can translate them.
- **Transport is not decided.** Verified 2026-09-17: `partykit` last published
  2025-05-21 and `@y-sweet/sdk` 2025-09-16 — both stale. `y-websocket` and
  `@hocuspocus/server` are current. Re-verify at adoption.
- Two problems are named but unsolved: concurrent reparent cycles (the repair is
  written and deterministic; it must move into the merge path) and migrating a
  live shared document (version-gate at the room level).
- Collaborative undo semantics are a **product** question, not a technical one,
  and stay deferred.

See [Collaboration](../architecture/09-collaboration.md) for the full design.
