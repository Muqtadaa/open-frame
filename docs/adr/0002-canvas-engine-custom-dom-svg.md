# ADR 0002 · Build our own DOM/SVG renderer

**Status:** Accepted · 2026-09-17
**This is the highest-impact decision in the project.**

## Context

OpenFrame needs an infinite canvas with pan, zoom, selection, dragging, text
editing and eventually connectors, freehand ink and images. Mature options exist.

Two hard constraints shaped the choice:

1. **Extensible semantic object types are the product.** An `evidence` object
   with `source`, `participant` and `tags` must be a first-class canvas object,
   not a shape with a metadata bag stapled to it.
2. **There is no budget for commercial licensing.** Stated by the project owner
   as a hard constraint, not a preference.

Verified at decision time (npm registry, 2026-09-17):

- `tldraw@5.4.2` — **proprietary licence**; production use requires a paid
  commercial licence or a watermarked hobby licence.
- `@excalidraw/excalidraw@0.18.1` — MIT, but its element union is **closed**.
  Custom element types have been an open request since 2022
  (excalidraw#4957, excalidraw discussion#9252); the sanctioned extension point
  is a `customData: Record<string, any>` bag.

## Decision

Build a **custom DOM/SVG renderer**: a viewport-culled object layer of
absolutely-positioned elements, with pan and zoom applied as a single CSS
transform.

Keep it behind culling and hit-testing interfaces so the object layer can move to
Canvas2D without touching the domain.

## Alternatives considered

**tldraw.** Wins on everything about _today_: interaction quality, custom shapes,
built-in sync. Rejected for three reasons. Its licence forbids production use
without payment, which the owner has ruled out. Its store, migrations and sync
are a package deal that wants to _be_ the document model — using it as a pure
view forfeits its sync, the largest reason to adopt it, while adopting its store
violates the domain-independence requirement outright. And a proprietary licence
on the layer nearest users is a standing business risk that has already changed
once (in v4).

**Excalidraw.** MIT and free, so cost alone would not have ruled it out. A closed
element union does. `customData: Record<string, any>` cannot express the product.

**Canvas2D from the start.** Better raw throughput, and it forfeits
accessibility, text input, IME, spellcheck and focus management — all of which
DOM provides for free and none of which can be retrofitted onto a pixel buffer.

**WebGL.** Solves a problem we do not have, at a cost a solo developer cannot
carry.

## The decisive argument: asymmetric reversibility

Domain-first, adopting a canvas SDK later costs **one adapter**. SDK-first,
extracting later costs **a rewrite**. When two options differ mainly in future
optionality, take the cheap-to-reverse one.

## Consequences

**Accepted costs**

- Interaction quality is now our own problem. Freehand smoothing, connector
  routing, rich text and snap/align are all real work.
- Time-to-first-feature is slower than adopting an SDK.

**Gains**

- No licence cost and no vendor risk.
- Semantic object types are natural rather than fought for.
- Accessibility works: real DOM nodes, real `<textarea>`, real focus.
- The domain genuinely does not know what renders it.

**Consequence of the licensing constraint** — the fallback ladder is now:

```
DOM/SVG object layer  →  Canvas2D object layer  →  (no third option)
```

There is no buying our way out. That raises the value of one sequencing rule:
**build the viewport transform and pointer pipeline first**, so that if it does
not feel right we learn in week one rather than month three. Phase 1 was
sequenced accordingly.

See [risk R1](../appendices/c-risks.md) and
[Appendix B](../appendices/b-canvas-engine-matrix.md) for the full matrix.
