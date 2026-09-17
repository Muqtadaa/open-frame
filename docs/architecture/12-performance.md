# 12 · Performance

← [Documentation index](../README.md)

The goal is **graceful scaling**, not a promised object count. This document
records the decisions that make later optimisation possible and the
instrumentation that tells us when it is needed.

---

## Measured facts

From `pnpm bench:fixtures` (deterministic generator,
[`tools/bench/generate-board.ts`](../../tools/bench/generate-board.ts)):

| Objects | Serialized size | Generation time |
| ------: | --------------: | --------------: |
|     100 |           29 KB |            3 ms |
|   1,000 |          294 KB |            5 ms |
|   5,000 |          1.4 MB |           40 ms |
|  10,000 |          3.0 MB |           51 ms |

### Renderer scaling probe

From `pnpm test:bench` (headless Chromium, 1280×720, middle-drag pan):

| Objects |  Load | DOM nodes | Visible | Pan p50 | Pan p95 |
| ------: | ----: | --------: | ------: | ------: | ------: |
|     100 |  5 ms |        28 |      28 | 16.7 ms | 16.8 ms |
|   1,000 |  7 ms |        40 |      40 | 16.7 ms | 16.8 ms |
|   5,000 | 14 ms |        40 |      40 | 16.7 ms | 16.7 ms |
|  10,000 | 20 ms |        48 |      48 | 16.7 ms | 16.7 ms |

**DOM node count is flat across a 100× range in board size.** That is the
property the whole DOM-renderer strategy depends on, and the probe asserts it
rather than merely reporting it.

Headless timings understate real hardware and overstate consistency. They are a
smoke signal, not a substitute for using the canvas.

### What the probe caught immediately

The first run showed pan p95 of **150 ms at 5,000 objects and 617 ms at 10,000**,
while p50 stayed at 16.7 ms — the signature of a small number of catastrophic
frames rather than uniform slowness.

Cause: `objectsInPaintOrder` called `childrenOf` once per object, and
`childrenOf` scans the entire document. On a flat 10,000-object board that is
~100 million iterations and 10,000 sorts, **per pan frame**. Replacing it with a
single grouped index (`groupByParent`) brought p95 to 16.7 ms at every size.

This is the argument for having the instrument at all: the defect was invisible
to 150 unit tests, invisible at development scale, and would have been read as
"the custom renderer does not scale" — the wrong conclusion, drawn about the most
expensive decision in the project.

Those are numbers, not estimates. Everything below is a decision; only these are
measurements.

---

## The three decisions that matter most

### 1. Nothing is written during a drag

500 pointer events produce zero patches, zero saves, zero undo entries and zero
re-renders outside the dragged objects. This is the single largest contributor to
interaction performance, and it is a _correctness_ rule as much as a speed one.

### 2. Viewport culling bounds DOM node count

Node count tracks what is on screen, not what exists. A 10,000-object board
mounts the same number of nodes as a 200-object board at the same zoom. This is
what makes a DOM renderer viable at all — see
[Canvas renderer](08-canvas-renderer.md).

### 3. Per-object subscription channels

```ts
readonly #objectListeners = new Map<ObjectId, Set<() => void>>()
```

A single flat listener list would mean every mounted object re-checking itself on
every change — O(objects) React work per pointer-up. Invisible at ten objects,
fatal at five thousand. Only visible objects are mounted, so the map stays small
regardless of board size.

Asserted directly:

> _"notifies only the objects that actually changed"_ —
> [`document-store.test.ts`](../../packages/core/src/store/document-store.test.ts)

---

## Structural choices that keep optimisation open

| Choice                                                | What it protects                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| Patches carry `affectedIds`                           | Targeted re-render and index updates, never full rescans         |
| Objects keep referential identity when untouched      | `memo` and `useSyncExternalStore` actually work                  |
| `SpatialIndex` is a port with a linear implementation | Swapping in `flatbush`/`rbush` is one file, no call-site changes |
| One CSS transform for pan and zoom                    | Panning moves a compositor layer, not N elements                 |
| Hit testing in world coordinates                      | No forced layout reads; survives a move to Canvas2D              |
| Connector paths derived, not stored                   | Moving an object does not cascade writes                         |
| Fractional ordering                                   | Reorder writes one object, not every sibling                     |
| Style as tokens                                       | Documents stay small; serialization stays fast                   |

---

## Instrumentation

The status bar shows object count, visible count and zoom — the three numbers
worth watching while loading a benchmark board. `ObjectLayer` also exposes
`data-visible-count` for assertions.

In development builds only, a panel in the status bar loads benchmark boards and
reports rolling frame timing (p50/p95). It is statically guarded by
`import.meta.env.DEV`, so the bundler removes it from production entirely —
verified by a bundle grep, not assumed.

`pnpm test:bench` runs the same measurements headlessly and is the tool of record
for anything that runs per frame.

`pnpm build:bench` produces a **deployable** build with the panel and fixtures
included, so the renderer question can be assessed on real hardware from a URL
rather than only on a machine with the repo checked out. A normal `pnpm build`
contains neither — verified by inspecting the output, not assumed.

---

## Known limits, and their triggers

| Limit                         | Becomes relevant                         | Response                                                          |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| DOM nodes when zoomed far out | ~1k+ objects visible at once             | Level-of-detail: below a zoom threshold render simplified proxies |
| Linear culling scan           | ~1k+ objects                             | Replace behind `SpatialIndex`                                     |
| Whole-document save           | Server persistence                       | `applyPatches` already exists on the port                         |
| Per-object migration on load  | Large boards, second schema change       | Migrate lazily on access                                          |
| Fractional key growth         | ~230 inserts between the same neighbours | Rebalance command; server-coordinated once multiplayer exists     |

None of these are being worked on. They are written down so that when one bites,
the response is already known.

---

## Next

- [Appendix C · Risks](../appendices/c-risks.md)
- [08 · Canvas renderer](08-canvas-renderer.md)
