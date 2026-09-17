# OpenFrame

A **structured visual workspace** on an infinite canvas.

OpenFrame is in the product category of Miro and FigJam, built around a different
premise: canvas objects carry _meaning_, not just appearance. A sticky note and a
piece of research evidence are the same kind of thing to the system — they differ
only in the payload they carry.

```ts
{ type: 'sticky',   data: { text: 'Customers do not understand pricing' } }

{ type: 'evidence', data: { text: 'Customers do not understand pricing',
                            source: 'September usability study',
                            participant: 'P07',
                            tags: ['pricing', 'comprehension'] } }
```

Both are spatially manipulable canvas objects. Only one of them can be queried,
filtered, linked and reasoned about.

---

## Status

**Phase 1 — foundation. Complete.**

The architectural skeleton, proved end to end by the smallest object type that
could prove it: sticky notes you can create, edit, drag, restyle, delete, undo
and reload. Everything else is deliberately absent.

This is not a demo of features. It is a demo of seams.

---

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm verify     # typecheck + lint + boundaries + tests + build
```

Requires Node 22+ and pnpm 10+.

---

## Structure

```
packages/core   Domain, commands, schema, ports. Pure TypeScript —
                no React, no DOM, no database, no CRDT. Two dependencies.

apps/web        Canvas renderer, interaction layer, UI, storage adapters.

docs/           Architecture, decision records, roadmap, appendices.
```

---

## The five ideas

1. **The domain is pure.** Enforced in CI, not merely intended.
2. **One mutation path.** Everything persistent goes through the command layer —
   later including AI, the API and MCP.
3. **Nothing is written during a drag.** One rule that fixes undo granularity,
   multiplayer semantics and performance at once.
4. **Object behaviour lives in a registry.** Adding a semantic type is two
   one-line registrations plus its own folder.
5. **Never write back a document you could not read.**

---

## Documentation

**[Start here →](docs/README.md)**

- [Architecture overview](docs/architecture/01-overview.md) — the system in ten minutes
- [Decision records](docs/adr/README.md) — why things are the way they are
- [Roadmap](docs/phases/README.md) — what is built and what is next
- [`CLAUDE.md`](CLAUDE.md) — engineering rules for working in this repo

---

## Licence

Not yet chosen.
