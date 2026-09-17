# 08 · Canvas renderer

← [Documentation index](../README.md) · Source: [`apps/web/src/canvas`](../../apps/web/src/canvas)

OpenFrame renders its own canvas with **DOM and SVG**, not with a canvas SDK.
The reasoning is in [ADR 0002](../adr/0002-canvas-engine-custom-dom-svg.md) and
the full comparison is in [Appendix B](../appendices/b-canvas-engine-matrix.md).

---

## How it works

One CSS transform on the world layer:

```tsx
<div className="of-world" style={{
  transform: `scale(${zoom}) translate(${-viewport.x}px, ${-viewport.y}px)`
}}>
```

Panning and zooming a board with hundreds of objects therefore moves **a single
compositor layer** rather than repositioning every element.

Inside it, one absolutely-positioned element per **visible** object.

### Viewport culling is what makes DOM viable

```ts
cullToViewport(document, registry, visibleWorldRect(viewport, w, h), padding)
```

DOM node count tracks what is _on screen_ — typically a few hundred — not what
exists. A 10,000-object board mounts the same number of nodes as a 200-object
board at the same zoom level.

The implementation is a linear scan over paint order. This is the right choice at
current scale and **not a placeholder to feel bad about**: a spatial index
returns unordered results, so paint order would have to be restored afterwards
anyway. The `SpatialIndex` port in core is where a replacement goes when
profiling says so.

Objects just outside the viewport are kept mounted (200px padding) so panning
does not flicker.

### Hit testing runs in world coordinates

Never by reading DOM rectangles. Asking the browser where an element ended up
would couple selection to the renderer's implementation — and would break the
moment the object layer moves to Canvas2D, where there are no elements to ask.

Marquee selection requires **full containment**, not intersection: dragging a box
across a crowded board should not sweep up everything it brushes.

---

## Accessibility comes free, and only this way

Each object is a real DOM node with a role and an accessible name. Text editing
uses a real `<textarea>`. Screen readers work, focus works, browser text input
works — IME composition, spellcheck, autocorrect, mobile keyboards.

A canvas-based renderer cannot offer any of this, and retrofitting accessibility
onto a pixel buffer is far harder than keeping it from the start. This was a
significant factor in the engine decision.

---

## Interaction is decided separately from its effects

```
pointer event
   ↓
interaction/pointer-controller.ts   ← PURE functions: event context → intents
   ↓
canvas/use-canvas-gestures.ts       ← performs the effects
   ↓
store update  or  command dispatch
```

`onPointerDown(ctx) → PointerIntent[]` takes plain objects and returns plain
objects. Interaction rules are therefore tested without synthesising DOM events
or rendering a component — see
[`pointer-controller.test.ts`](../../apps/web/src/interaction/pointer-controller.test.ts).

### Rules that are easy to get wrong

| Rule                                                              | Why                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Pressing an already-selected object drags the **whole selection** | Otherwise multi-object drag needs a modifier                                   |
| A press must travel 3px before becoming a drag                    | A click with a tremor would otherwise fill undo with moves the user never made |
| The canvas calls `preventDefault()` on pointerdown                | Otherwise mouseup steals focus from a just-opened editor and commits it empty  |
| Pointer events from inside a text control are ignored             | Otherwise clicking to move the caret closes the editor                         |

The last two were real bugs, found by the E2E suite. They are listed here
because they are invisible until they bite.

---

## Components, deliberately small

| File                            | Responsibility                                                        |
| ------------------------------- | --------------------------------------------------------------------- |
| `Canvas.tsx`                    | Composes the others and applies the viewport transform. Nothing else. |
| `ObjectLayer.tsx`               | Culls, maps visible objects to views                                  |
| `ObjectView.tsx`                | Subscribes to one object; applies live drag delta at render time      |
| `ObjectErrorBoundary.tsx`       | Contains a render failure to the one object that caused it            |
| `MarqueeOverlay.tsx`            | The rubber band                                                       |
| `use-canvas-gestures.ts`        | Pointer effects                                                       |
| `use-canvas-size.ts`            | ResizeObserver                                                        |
| `culling.ts` / `hit-testing.ts` | Pure geometry over the document                                       |

A `Canvas.tsx` that accumulated all of this is the god component the
architecture forbids.

### Selectors must return stable values

```ts
// WRONG — a fresh object every call; useSyncExternalStore loops forever
useInteractionStore((s) => ({ dx: s.drag.dx, dy: s.drag.dy }))

// RIGHT — primitives
useInteractionStore((s) => (s.drag.kind === 'translate' ? s.drag.dx : 0))
```

This crashed the app during development. Zustand compares with `Object.is`; only
primitives or stable references are safe.

---

## The escape hatch

Ruling out commercial licensing removed tldraw as a fallback. The remaining
ladder is:

```
DOM/SVG object layer  →  Canvas2D object layer  →  (no third option)
```

Both sit behind the same culling and hit-testing interfaces, so the swap does not
touch the domain, commands, persistence or schema. Freehand ink will go straight
to Canvas2D when it arrives.

See [risk R1](../appendices/c-risks.md).

---

## Next

- [12 · Performance](12-performance.md) — measurement and benchmark boards
- [Appendix B](../appendices/b-canvas-engine-matrix.md) — the engine comparison
