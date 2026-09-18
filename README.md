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

**Phase 2 — core canvas. Complete.**

A canvas you can actually work on: sticky notes, text, eight shape kinds, frames,
connectors, images and groups; selection, resize, rotation, z-order, clipboard
and undo; snap-to-grid and alignment guides; local persistence with schema
versioning and migrations.

[ADR 0002](docs/adr/0002-canvas-engine-custom-dom-svg.md) asked whether a custom
DOM/SVG renderer could carry this. It can: DOM node count stays flat from 100 to
10,000 objects, and a cull pass on a 10,000-object mixed board costs about 3ms.

Next is [Phase 3 · Structured objects](docs/phases/phase-3-structured-objects.md)
— the reason OpenFrame exists.

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

[GNU Affero General Public License v3.0](LICENSE) — see [`LICENSE`](LICENSE) for
the full text.

Copyright (C) 2026 Muqtadaa.

The AGPL is the GPL plus one clause that matters for software like this:
**section 13**. If you modify OpenFrame and let people use it over a network,
you have to offer those users the source of your modified version. Running it
privately, or using it unmodified, carries no such obligation.

That is the point of choosing it. A canvas app's natural failure mode is someone
hosting it as their own product while contributing nothing back; the AGPL does
not prevent that, it just requires the improvements to be published too. As sole
copyright holder I can also grant commercial licences on different terms, which
a permissive licence would have given away for free.

This deployment therefore links to its source from the status bar, which is how
section 13's offer is made. **If you fork and host it, that link is yours to
keep pointing at your own source.**
