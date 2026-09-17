# ADR 0008 · Two version axes, pure migrations

**Status:** Accepted · 2026-09-17

## Context

Documents live in users' storage indefinitely. Once a board has been saved by a
build, that format must be readable forever. Retrofitting versioning onto
documents already on disk has no good solution.

## Decision

**Two independent version axes:**

- `schemaVersion` on the envelope — the shape of the _document_.
- `dataVersion` per object — the shape of _one type's_ payload.

**Three rules for migrations:**

1. A migration must **never import a current domain type**. It declares its own
   local input and output shapes and operates on `unknown`.
2. Migrations are **pure functions over plain JSON** — no clock, no randomness,
   no IO, no UI.
3. Migrations are **forward-only and never edited** once shipped.

**Gaps are loud.** Migrations are keyed by target version, so a missing step is
easy to overlook; `migrateDocumentPayload` throws rather than skipping.

**Unknown types are preserved**, not dropped, and round-trip byte-for-byte.

## Alternatives considered

**One version number.** Would force every board through a whole-document
migration whenever a single object type gained a field.

**No versioning until needed.** The failure mode is silent and unrecoverable:
the first time a format changes, every existing board becomes unreadable with no
way to tell what it used to mean.

**Migrations importing current types.** The tempting shortcut, and the reason
rule 1 is stated first. Such a migration silently changes meaning every time the
type changes, and the bug only fires on old data nobody has in front of them.

**Rejecting documents with unknown object types.** Would make every future type
a breaking change for older clients, and would destroy a collaborator's work
whenever someone opened a board in an older build.

## Consequences

- Adding a field to `evidence` does not touch any board on disk.
- Migrations are testable as fixture-in / fixture-out, with frozen fixtures
  committed alongside them.
- Forward compatibility is asserted by an explicit round-trip test rather than
  assumed — without it the guarantee regresses the first time the serializer is
  tidied.
- The load pipeline distinguishes **document failure** (quarantine the board,
  read-only) from **object failure** (degrade one object). One malformed sticky
  note never costs access to a workshop.
- **Never write back a document you could not fully read.**
