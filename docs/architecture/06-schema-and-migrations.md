# 06 · Schema and migrations

← [Documentation index](../README.md) · Source: [`packages/core/src/schema`](../../packages/core/src/schema)

Schema evolution exists from the first commit, not from the first time it is
needed. Retrofitting versioning onto documents already in users' browsers is the
kind of problem that has no good solution.

---

## Two independent version axes

| Axis                                    | Bump when                                                                       | Where                  |
| --------------------------------------- | ------------------------------------------------------------------------------- | ---------------------- |
| **Document envelope** (`schemaVersion`) | The _shape_ of the board changes — renaming a field, moving data between levels | `schema/version.ts`    |
| **Per-type payload** (`dataVersion`)    | One object type evolves its own `data`                                          | That type's definition |

They are independent so that adding a field to `evidence` never forces every
board on disk through a whole-document migration, and vice versa.

## The envelope

```ts
interface PersistedBoard {
  format: 'openframe.board'
  schemaVersion: number
  savedAt: number
  board: unknown // validated only AFTER migration
}
```

`board` stays `unknown` until migrations have run. Validating a v1 payload
against today's schema would fail for every old document — which is precisely
the bug schema versioning exists to prevent.

---

## The three migration rules

### 1. A migration must never import a current domain type

This is the rule that gets broken, and it is the one that matters most. A
migration that imports today's `BoardDocument` **silently changes meaning** every
time that type changes. It then stops being a migration and becomes a bug that
only fires on old data nobody has in front of them.

Each migration declares its own local input and output shapes and operates on
`unknown`.

### 2. Migrations are pure functions over plain JSON

No clock, no randomness, no IO, no UI. That is what makes them testable from
frozen fixtures — see
[`__fixtures__/v1-minimal.json`](../../packages/core/src/schema/__fixtures__/v1-minimal.json).

### 3. Migrations are forward-only and never edited once shipped

Documents saved by old builds exist forever.

### Gaps are loud

Migrations are keyed by **target** version, which makes a missing step easy to
overlook. If `migrations[3]` exists but `migrations[2]` does not, a naive loop
would happily "migrate" a v1 document to v3 while skipping half the
transformation. `migrateDocumentPayload` throws instead.

---

## The load pipeline

```
 raw bytes
   → JSON.parse                       ── fail → QUARANTINE (unparseable)
   → validate envelope (Zod)          ── fail → QUARANTINE (invalid-envelope)
   → schemaVersion > current?         ── yes  → QUARANTINE (newer-schema)
   → run document migrations          ── throw → QUARANTINE (migration-failed)
   → validate payload (Zod)           ── fail → QUARANTINE (invalid-payload)
   → per object:
       ├─ known type?  → migrate data → validate
       │                   ├─ ok   → typed object
       │                   └─ fail → UnknownObject (raw preserved)  [DEGRADED]
       └─ unknown type?               → UnknownObject (raw preserved)  [DEGRADED]
   → repair invariants (cycles, dangling parents, non-finite frames)
   → BoardDocument + repairs[] + degraded[]
```

**A document-level failure quarantines the board. An object-level failure
degrades only that object.** One malformed sticky note must never cost a user
access to a workshop.

---

## The cardinal rule

> **Never write back a document you could not fully read.**

A quarantined board opens read-only, surfaces a banner, and **autosave is never
attached**. Writing a partial document over one that failed to parse destroys the
user's work permanently — the one failure mode this system must not have.

This is enforced in
[`composition-root.ts`](../../apps/web/src/app/composition-root.ts) and tested in
[`adapters.test.ts`](../../apps/web/src/adapters/adapters.test.ts).

---

## Validation policy

| Boundary                         |                      Validate?                      |
| -------------------------------- | :-------------------------------------------------: |
| Document load / import           |                  ✅ always, fully                   |
| API / MCP / AI structured output |         ✅ always, before building commands         |
| `UpdateObjectData` payloads      | ✅ — the record is arbitrary and may be AI-authored |
| Remote CRDT updates _(later)_    | ✅ object `data` only; structure is CRDT-guaranteed |
| Internal command handling        |        ❌ dev-mode invariant assertions only        |
| Render path                      |                      ❌ never                       |

Validating trusted internal objects on every mutation is a measurable hot-path
cost with no safety benefit. **Validate at the airlock, not in every room.**

---

## Forward compatibility, tested

```ts
it('writes the original type, version and payload back unchanged', () => { … })
```

Load a board containing `type: "evidence"` in a build that has never heard of
`evidence`; save it; assert the object is byte-identical. Without a test that
asserts this, the guarantee silently regresses the first time someone tidies the
serializer.

---

## Next

- [07 · Persistence](07-persistence.md) — where documents live
- [10 · Errors and degradation](10-errors-and-degradation.md) — the full failure table
