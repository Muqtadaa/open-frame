# Appendix F · Glossary

← [Documentation index](../README.md)

Terms used precisely throughout this documentation. Where a word has a loose
everyday meaning and a specific meaning here, the specific one is what is meant.

---

**Adapter** — a concrete implementation of a **port**, living in `apps/web` or a
future service. `IndexedDbBoardRepository` is an adapter.

**Awareness** — Yjs's term for ephemeral presence state. Dropped on disconnect;
never persisted. Cursors, selections and in-flight drags live here.

**Board document** — the persistent content of one board: objects, assets and
metadata. What survives a reload. Contrast with **interaction state**.

**Capability** — a permitted action (`view`, `comment`, `edit`, `manage`, `own`).
Authorization asks whether an action is permitted, never what role someone holds.

**Command** — a plain serializable description of an intended change. The only
legal way to mutate the board document.

**Composition root** — the single module that knows both an interface and which
implementation satisfies it. `apps/web/src/app/composition-root.ts`.

**Culling** — excluding objects outside the visible world rect from rendering.
What makes a DOM renderer viable at board scale.

**Degraded object** — an object this build could not interpret, preserved as an
`unknown` placeholder with its original payload intact. Contrast with
**quarantine**, which applies to a whole board.

**Derived** — computed on demand and never stored. Connector paths are derived.

**Dispatcher** — `CommandDispatcher`. Authorizes, validates, applies, records and
emits. The one door.

**Envelope** — a command plus `actor`, `origin`, `transactionId` and `label`.

**Erased definition** — an `ObjectTypeDefinition` with its payload type removed,
so generic code can hold definitions for types it knows nothing about.

**Fractional index** (`OrderKey`) — a string sort key compared lexicographically,
allowing insertion between any two neighbours without renumbering siblings.

**Frame** — two unrelated meanings, disambiguated by context:

1. `ObjectFrame` — an object's x/y/width/height/rotation.
2. A future container object type that holds children.

**Interaction state** — transient, client-only state: tool, selection, hover,
drag delta, marquee, viewport. Never persisted, never in undo.

**Intent** — what a pointer gesture _means_, decided by pure functions before any
effect is performed.

**Origin** — what produced a change: `user | ai | api | mcp | import | remote`.
Recorded on every command envelope; the basis for audit, AI rollback and
collaborative undo.

**Patch** — one of three operations (`add`, `remove`, `set`) over the document.
OpenFrame's own format, not a CRDT format and not JSON Patch.

**Port** — an interface in `packages/core` describing something the domain needs
from the outside world. Contains no implementation.

**Presence** — see **awareness**.

**Quarantine** — a board that could not be read. Opens **read-only**; autosave is
never attached; the raw payload is retained. Contrast with a **degraded object**.

**Registry** — two of them, joined by type string: `ObjectTypeRegistry` (pure,
in core) and `ObjectViewRegistry` (React, in web).

**Schema version** — the document envelope's format version. Distinct from an
object's `dataVersion`.

**Semantic object** — a canvas object carrying domain meaning beyond its
appearance: `evidence`, `insight`, `experiment`. The reason OpenFrame exists.

**Structural change** — a patch list that adds or removes objects, as opposed to
one that only modifies them. Structure subscribers are notified only for these.

**Token** — a named style value (`'yellow'`) rather than a literal (`#ffe57f`).
Documents store tokens so themes can change and AI can express intent.

**Transaction** — several commands committed as one undoable action.

**World coordinates** — the infinite canvas's own coordinate space, independent
of zoom and scroll. Contrast with **screen coordinates**. Hit testing and geometry
always work in world coordinates.
