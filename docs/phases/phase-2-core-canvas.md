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
| `shape`     | ✅ Eight kinds — one type with a `shape` discriminant in `data`, not eight entries      |
| `connector` | Endpoints already modelled; needs routing and rendering                                |
| `frame`     | A named container. First type with `canHaveChildren: true`                             |
| `image`     | ✅ First consumer of `AssetStore`. Drop, paste or pick; alt text is the editable field |

### Commands

✅ `ReorderObjects`, `RotateObjects`, `SetLocked`, `SetHidden`. Duplicate, copy
and paste are built from ordinary `CreateObjects` rather than bespoke commands,
so they inherit the same validation and history.

✅ `ReparentObjects`, with the cycle guard finally getting a caller.

Connectors are created through ordinary `CreateObjects` — no bespoke command
was needed, because the endpoints are just data.

Remaining: `GroupObjects` / `UngroupObjects` as `transact` composites.

**An image stores its whole `AssetRef`, not an id into `BoardDocument.assets`.**
A `Patch` addresses an `ObjectId`, so there is no way to write that map through
the command layer without widening the change format — a cost the collaboration
adapter, undo and serialization would then carry forever. The map would also not
have bought what it appears to: deciding which assets are still referenced means
walking the objects either way. The duplication is a few fields per image, and it
makes an image self-contained across a copy between boards.

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

✅ Snap to grid (on by default, Cmd/Ctrl suspends it) and alignment guides
against neighbours' edges and centres, which take precedence over the grid per
axis.

✅ Dragging an existing connector endpoint to re-attach or detach it.

Remaining: group/ungroup as `transact` composites.

**Browser zoom must stay out of the way.** `Ctrl/Cmd` with `+`, `−`, `0`, `1`
and with the wheel are all claimed and prevented; see
[CLAUDE.md](../../CLAUDE.md) rule 13 for why that needs a native listener.

### Rendering

Level-of-detail below a zoom threshold (simplified proxies), connector routing
(straight, orthogonal, curved), `SpatialIndex` swap **if** benchmarks demand it —
measured, not assumed.

---

## Architectural work this phase forces

**Asset pipeline.** ✅ `AssetStore` has its first implementation. Bytes go to
IndexedDB under a stable `idb:<id>` locator — never an object URL, which would
be dead on the next page load. The document holds only an `AssetRef`.

Uploads are validated by size, declared type **and sniffed content**, because a
file's declared type comes from its extension and is trivially wrong. **SVG is
refused rather than sanitised**; see [Security](../architecture/11-security.md).

Two pieces fell out of this. `AssetStore.resolve` is asynchronous because a
server adapter will have to be, but a view cannot await — so `AssetService`
bridges them with a synchronous cache lookup that reports `loading`, `ready` or
`missing`, and re-renders subscribers when bytes land. And because only some
views need that, `ObjectViewDefinition` gained a `usesAssets` flag: checking
`type === 'image'` at the call site would be the type switch rule 5 forbids, and
would also wake all ten thousand objects on a bench board for one image load.

**Connector geometry.** ✅ Paths are derived from endpoints, never stored, and
that survives move, resize and delete. Deleting an attached object converts that
end to a free point; deleting both ends deletes the connector, because a line
between two things that no longer exist is litter rather than content.

Making this work required four registry additions. `getBounds(object, doc)` and
`hitTest`, because a connector's geometry depends on objects it only references;
then `endpoints` and `retargetEndpoint`, so that dragging an end is a property
of the TYPE rather than a connector special case in the overlay. The gesture
reports only what was dropped on — which anchor to use, and whether the drop is
allowed at all, is the type's decision. See [CLAUDE.md](../../CLAUDE.md) rule 16.

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
