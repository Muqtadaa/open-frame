# Roadmap

← [Documentation index](../README.md)

Each phase is scoped so that it can be built, tested and shipped without the next
one existing. Nothing here is a commitment to a date.

| Phase                                                   | What it delivers                                                 | Status      |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ----------- |
| [1 · Foundation](phase-1-foundation.md)                 | The architectural skeleton, proved end to end by one object type | ✅ **Done** |
| [2 · Core canvas](phase-2-core-canvas.md)               | The canvas a person would actually use                           | ✅ **Done** |
| [3 · Structured objects](phase-3-structured-objects.md) | The reason OpenFrame exists                                      | ✅ **Done** |
| [4 · Collaboration](phase-4-collaboration.md)           | Multiplayer, presence, comments                                  | ✅ **Done** |
| [5 · AI and MCP](phase-5-ai-and-mcp.md)                 | Agents as first-class board participants                         | ▶ Next      |
| [5a · MCP server](phase-5a-mcp-server.md)               | The execution plan for the MCP half, which goes first            | ▶ Stage 4   |

---

## The sequencing logic

**Phase 1 before anything visible.** The seams that cannot be retrofitted — the
document model, the command layer, schema versioning, the object type registry —
were built first, and proved with the smallest possible object type. The brief's
own framing: _the worst acceptable outcome is a visually impressive canvas on a
poor data architecture._

**Phase 2 before Phase 3.** Structured objects are the differentiator, but they
are worthless on a canvas that is unpleasant to use. Phase 2 also answers the
open question from [ADR 0002](../adr/0002-canvas-engine-custom-dom-svg.md): can a
custom renderer reach the interaction quality this product needs? That question
should be answered before more is built on top of it.

**Phase 3 before Phase 4.** Collaboration multiplies whatever exists. Multiplying
a generic whiteboard produces a generic whiteboard with more cursors.

**Phase 5 last.** AI needs semantic objects to be useful. "Turn this evidence
into an insight" requires evidence and insights to exist. Running it earlier
would mean building AI features against sticky notes, which is the shallow
version of the product.

---

## What stays true across every phase

The [architectural rules](../../CLAUDE.md) do not change by phase:

- The domain stays pure.
- All persistent mutation goes through commands.
- Nothing is written during a drag.
- Object behaviour lives in the registry.
- Documents stay versioned and migratable.
- A document that cannot be read is never overwritten.

A phase that would require breaking one of these needs an ADR first.
