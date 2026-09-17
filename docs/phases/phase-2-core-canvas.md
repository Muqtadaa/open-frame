# Phase 2 · Core canvas

**Status: ▶ Next** · ← [Roadmap](README.md)

Turn the architectural skeleton into a canvas someone would choose to use.

---

## The question this phase answers

[ADR 0002](../adr/0002-canvas-engine-custom-dom-svg.md) bet that a custom DOM/SVG
renderer can reach the interaction quality this product needs. Phase 2 is where
that is confirmed or refuted, and it should be answered **before** more is built
on top of it.

The stated checkpoint: if by the end of this phase the roadmap is dominated by
interaction primitives rather than product, revisit the renderer decision — the
domain does not change either way.

---

## Scope

### Objects

| Type        | Notes                                                                                  |
| ----------- | -------------------------------------------------------------------------------------- |
| `text`      | Free text without a note background                                                    |
| `shape`     | Rectangle, ellipse, triangle, diamond — one type with a `shape` discriminant in `data` |
| `connector` | Endpoints already modelled; needs routing and rendering                                |
| `frame`     | A named container. First type with `canHaveChildren: true`                             |
| `image`     | First consumer of `AssetStore`                                                         |

### Commands

`ReparentObjects` (with the existing cycle guard), `ReorderObjects`,
`RotateObjects`, `GroupObjects` / `UngroupObjects` (composites, via `transact`),
`CreateConnector`, `SetLocked`, `SetHidden`, `DuplicateObjects`.

### Interaction

Resize handles, rotation handle, snapping and alignment guides, keyboard nudge,
copy/paste/duplicate, zoom-to-fit and zoom-to-selection, right-click context
menu, multi-select refinements.

### Rendering

Level-of-detail below a zoom threshold (simplified proxies), connector routing
(straight, orthogonal, curved), `SpatialIndex` swap **if** benchmarks demand it —
measured, not assumed.

---

## Architectural work this phase forces

**Asset pipeline.** `AssetStore` gets its first implementation. Bytes go to
IndexedDB; the document holds only `AssetRef`. Upload validation and SVG
sanitization start here ([Security](../architecture/11-security.md)).

**Connector geometry.** Paths are derived from endpoints, never stored. This is
the first real test of that rule: it must survive move, resize and delete of the
objects a connector attaches to.

**Frame membership.** The first type with children. `ReparentObjects` must use
`wouldCreateCycle`, and deleting a frame must cascade — both already exist and
are tested.

**First real migration.** Almost certainly triggered by `shape` or `connector`
gaining a field. This is where the
[migration rules](../architecture/06-schema-and-migrations.md) get exercised for
real rather than in fixtures.

---

## Explicitly not in this phase

Rich text formatting, freehand ink, tables, templates, search, comments,
presentation mode, export. Each is a phase-sized piece of work on its own.

Freehand in particular should go **straight to Canvas2D** behind the existing
renderer interfaces rather than being attempted in SVG.

---

## Done when

- A person can build a real diagram — boxes, arrows, labels, grouping — without
  reaching for another tool.
- Benchmark boards at 1,000 objects pan and zoom smoothly.
- Every new object type was added without editing anything outside its own folder
  and two registration lines.
- The renderer question above has a clear answer.

---

## Next

[Phase 3 · Structured objects](phase-3-structured-objects.md)
