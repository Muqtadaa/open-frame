# Phase 2 · Core canvas

**Status: ▶ In progress** · ← [Roadmap](README.md)

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

✅ `ReorderObjects`, `RotateObjects`, `SetLocked`, `SetHidden`. Duplicate, copy
and paste are built from ordinary `CreateObjects` rather than bespoke commands,
so they inherit the same validation and history.

✅ `ReparentObjects`, with the cycle guard finally getting a caller.

Connectors are created through ordinary `CreateObjects` — no bespoke command
was needed, because the endpoints are just data.

Remaining: `GroupObjects` / `UngroupObjects` as `transact` composites.

**Coordinates are absolute.** Objects inside a frame store board coordinates, so
moving a container explicitly moves its contents. Relative coordinates were
rejected because every geometry consumer works in world space and would have had
to resolve a parent chain; see the comment on `move-objects.ts`.

### Interaction

✅ Keyboard shortcuts (V/H/S/T/U, undo, delete, select-all, duplicate, nudge),
zoom controls with slider and percentage entry, zoom-to-fit and
zoom-to-selection, scroll-to-zoom with a pan preference, floating tool rail.

✅ Resize handles (single and multi-selection, aspect lock on corners, Alt for
centre), rotation handle with 15° snapping, right-click context menu, clipboard,
z-order via bracket keys.

✅ Drop-to-nest: dropping objects on a frame changes membership, committed with
the move as one undoable action.

✅ Connector drawing: drag from one object to another, or to empty space for a
free end.

Remaining: snapping and alignment guides, dragging an existing connector
endpoint to re-attach it.

**Browser zoom must stay out of the way.** `Ctrl/Cmd` with `+`, `−`, `0`, `1`
and with the wheel are all claimed and prevented; see
[CLAUDE.md](../../CLAUDE.md) rule 13 for why that needs a native listener.

### Rendering

Level-of-detail below a zoom threshold (simplified proxies), connector routing
(straight, orthogonal, curved), `SpatialIndex` swap **if** benchmarks demand it —
measured, not assumed.

---

## Architectural work this phase forces

**Asset pipeline.** `AssetStore` gets its first implementation. Bytes go to
IndexedDB; the document holds only `AssetRef`. Upload validation and SVG
sanitization start here ([Security](../architecture/11-security.md)).

**Connector geometry.** ✅ Paths are derived from endpoints, never stored, and
that survives move, resize and delete. Deleting an attached object converts that
end to a free point; deleting both ends deletes the connector, because a line
between two things that no longer exist is litter rather than content.

Making this work required two registry additions — `getBounds(object, doc)` and
`hitTest` — because a connector's geometry depends on objects it only
references. See [CLAUDE.md](../../CLAUDE.md) rule 16.

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
