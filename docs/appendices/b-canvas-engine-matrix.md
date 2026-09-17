# Appendix B · Canvas engine comparison

← [Documentation index](../README.md) · Decision: [ADR 0002](../adr/0002-canvas-engine-custom-dom-svg.md)

The comparison behind building our own renderer. Scored 1–5, 5 best.

---

| Criterion                          | tldraw 5.4 | Excalidraw 0.18 | **Custom DOM/SVG** | Custom Canvas2D | WebGL |
| ---------------------------------- | :--------: | :-------------: | :----------------: | :-------------: | :---: |
| Interaction quality out of the box |   **5**    |        4        |         1          |        1        |   1   |
| Custom / semantic object types     |     4      |      **1**      |         5          |        5        |   4   |
| Domain independence                |     2      |        1        |       **5**        |        5        |   5   |
| Serialization neutrality           |     2      |        2        |       **5**        |        5        |   5   |
| React integration                  |     5      |        3        |       **5**        |        3        |   2   |
| Control over interaction           |     3      |        2        |       **5**        |        5        |   5   |
| Custom tools                       |     4      |        2        |       **5**        |        5        |   5   |
| Rendering at 10k objects           |     4      |        3        |        3 *         |      **5**      |   5   |
| **Accessibility**                  |     2      |        2        |       **5**        |        1        |   1   |
| Multiplayer compatibility          |   **5**    |        2        |         3          |        3        |   3   |
| **Licensing**                      |   **1**    |        5        |         5          |        5        |   5   |
| **Vendor lock-in**                 |   **1**    |        2        |         5          |        5        |   5   |
| Cost to replace later              |     1      |        1        |       **5**        |        5        |   4   |
| Solo-dev maintenance               |   **5**    |        4        |         2          |        2        |   1   |
| Time to first feature              |   **5**    |        4        |         2          |        2        |   1   |

\* With viewport culling, DOM node count tracks **visible** objects (typically
100–500), not total. The constraint is objects visible at once when zoomed out,
not objects in the document.

---

## What the matrix does not show

The scores make tldraw look competitive, and on a purely additive reading it
wins. Three factors that are not rows decided it instead.

### 1. Licensing was a hard constraint

`tldraw@5.4.2` is proprietary: production use requires a paid commercial licence,
or a hobby licence that keeps a visible watermark. The project owner ruled out
licensing costs. That removes tldraw from consideration regardless of merit —
and, notably, also removes it as a fallback.

### 2. Excalidraw's limitation is categorical, not incremental

Excalidraw is MIT and free, so cost alone would not have excluded it. Its element
union is **closed**. Custom element types have been an open request since 2022
(excalidraw#4957, discussion#9252), and the sanctioned extension point is
`customData: Record<string, any>`.

OpenFrame's entire premise is extensible semantic object types. A metadata bag
stapled to a rectangle cannot express `evidence`. This is not a gap that closes
with effort — it is the wrong shape.

### 3. Asymmetric reversibility

Domain-first, adopting an SDK later costs **one adapter**.
SDK-first, extracting later costs **a rewrite**.

When two options differ mainly in future optionality, take the cheap-to-reverse
one. This was the decisive argument even before licensing settled it.

---

## The accessibility row deserves emphasis

DOM/SVG gives real focusable nodes, ARIA roles and names, a real `<textarea>` for
text editing — and therefore IME composition, spellcheck, autocorrect and mobile
keyboards, all for free.

Canvas-based renderers cannot offer any of this, and retrofitting accessibility
onto a pixel buffer is far harder than keeping it from the start. For a tool
aimed at workshops and collaborative research, that is not a minor row.

---

## The cost, stated plainly

Interaction quality is now our problem. Freehand smoothing, connector routing,
rich text and snap/align are all real work that an SDK would have provided.

[Phase 2](../phases/phase-2-core-canvas.md) is where that bet is settled, and it
is sequenced to be settled early.
