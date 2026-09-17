# Phase 1 · Foundation

**Status: ✅ Complete** · ← [Roadmap](README.md)

The architectural skeleton, proved end to end by the smallest object type that
could prove it.

---

## What exists

### `packages/core` — the pure domain

| Area            | Delivered                                                                               |
| --------------- | --------------------------------------------------------------------------------------- |
| Geometry        | `Point`, `Rect`, `Viewport`; intersection, containment, union, screen↔world             |
| Document model  | Flat object map, `ObjectFrame`, token styles, branded ids, fractional ordering          |
| Invariants      | Cycle detection, deterministic cycle-breaking, dangling-parent and non-finite repair    |
| Patches         | 3-op format, `applyPatches`, generic `invertPatches`, structural-change detection       |
| Object registry | Typed definitions, type erasure, capabilities, `describe()`                             |
| Object types    | `sticky`, `unknown`                                                                     |
| Schema          | Versioned envelope, document + per-type migrations, full load pipeline, quarantine      |
| Commands        | 6 commands, dispatcher, authorization, validation, transactions, undo/redo              |
| Ports           | `BoardRepository`, `AssetStore`, `Capabilities`, `Clock`, `IdGenerator`, `SpatialIndex` |
| Store           | Read/write split, per-object subscription channels                                      |

### `apps/web` — the application

| Area             | Delivered                                                                   |
| ---------------- | --------------------------------------------------------------------------- |
| Composition root | Wires every port to an adapter; the only place holding `DocumentWriter`     |
| Adapters         | `IndexedDbBoardRepository`, `MemoryBoardRepository`                         |
| Canvas           | CSS-transform viewport, culling, world-space hit testing, marquee           |
| View registry    | React half of the type system, with fallback and per-object error boundary  |
| Interaction      | Pure pointer decisions, gesture effects, drag threshold, keyboard shortcuts |
| UI               | Toolbar, colour swatches, undo/redo, status bar, degradation notices        |

### Tooling

`pnpm verify` runs typecheck → lint → boundary check → tests → build.
`pnpm test:e2e` runs the browser journey. `pnpm bench:fixtures` generates
benchmark boards at 100 / 1k / 5k / 10k objects.

---

## Numbers

| Metric                      | Value                            |
| --------------------------- | -------------------------------- |
| Core unit tests             | 114                              |
| Web unit/integration tests  | 36                               |
| E2E tests                   | 5                                |
| Modules cruised, violations | 93 · 0                           |
| Core runtime dependencies   | 2 (`zod`, `fractional-indexing`) |
| Production bundle           | 353 KB (107 KB gzipped)          |

---

## What was deliberately left out

No connectors, frames, groups, rotation, images, freehand, text formatting,
templates, search, comments, authentication, server, collaboration, AI or MCP.

Each is modelled where it needed to be — connector endpoints and anchors exist as
types, capabilities include `canHaveChildren` and `connectable` — but none is
implemented. Phase 1 shipped **two** object types and **six** commands on purpose.

---

## What Phase 1 proved

**The architectural tests are not vacuous.** Each enforcement mechanism was
deliberately violated to confirm it fails. This caught a real defect: the
dependency-cruiser `core-is-pure` rule passed vacuously, because pnpm makes React
unresolvable from core and the rule only matched resolved `node_modules` paths.

**The E2E suite earns its cost.** It found four bugs unit tests could not:

1. The canvas collapsed to zero height when the notice banner was absent — a CSS
   grid template assuming a fixed child count.
2. Clicking away from an editor **discarded** the text instead of committing it.
3. A Zustand selector returning a fresh object looped `useSyncExternalStore`
   forever and crashed the board.
4. A gesture captured the selection _before_ the click that set it, so a
   select-then-drag committed an empty move.

Every one is invisible to unit tests and fatal in use.

**Both repository implementations satisfy one suite.** `describe.each` over the
port means a future Postgres adapter has an executable specification.

---

## Next

[Phase 2 · Core canvas](phase-2-core-canvas.md)
