import { useInteractionStore } from '../interaction/interaction-store.js'
import { drawnRect } from '../scene/draw.js'
import { ELLIPSE, shapePath } from '../scene/shape-geometry.js'
import type { ShapeKind } from '@openframe/core'

/**
 * The outline of an object being drawn to size, before it exists.
 *
 * Pure interaction state, like the marquee: the document is not written until
 * the pointer comes up, so a drag of any length is one command and one undo
 * entry.
 *
 * The preview takes the SHAPE being drawn rather than always a rectangle. An
 * ellipse previewed as a box is a lie about where its edges will land, and the
 * whole point of drawing to size is that you can see what you are going to get.
 */
export function DrawPreview() {
  const drag = useInteractionStore((state) => state.drag)
  if (drag.kind !== 'draw') return null

  const rect = drawnRect(drag.origin, drag.current, drag.constrained)
  if (rect.width < 1 || rect.height < 1) return null

  /*
   * The preview needs to know WHICH shape, and the gesture only carries the
   * type's create-data as an opaque record — the canvas does not know what a
   * shape is. Narrowed rather than asserted: an unreadable value previews as a
   * plain rectangle, which is the honest fallback for a type this overlay has
   * never heard of.
   */
  const kind = (drag.data as { shape?: unknown } | undefined)?.shape
  const shape = typeof kind === 'string' ? (kind as ShapeKind) : null

  return (
    <div
      /*
       * A shape that draws its OWN outline does not also get the box.
       *
       * The container's dashed border is the preview for anything this
       * overlay cannot draw — and for a rectangle the shape's own path IS
       * that box, so both were drawn and you followed the pointer with two
       * dashed rectangles, one inset in the other by the geometry's margin.
       * For an ellipse it was a box the finished object never fills, which
       * the comment above calls a lie about where its edges will land.
       */
      className={shape === null ? 'of-draw-preview' : 'of-draw-preview of-draw-preview--shaped'}
      data-testid="draw-preview"
      style={{
        transform: `translate(${String(rect.x)}px, ${String(rect.y)}px)`,
        width: `${String(rect.width)}px`,
        height: `${String(rect.height)}px`,
      }}
    >
      {shape === null ? null : <ShapeOutline kind={shape} />}
    </div>
  )
}


/**
 * The outline only — no fill, no colour, no label.
 *
 * A preview that looked like the finished object would be indistinguishable
 * from one that had already been created, and the difference matters: nothing
 * exists until the pointer comes up, and an undo before then has nothing to
 * undo.
 */
function ShapeOutline({ kind }: { kind: ShapeKind }) {
  // Null is the ellipse, the one shape that is not a polygon.
  const path = shapePath(kind)
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {path === null ? (
        <ellipse cx={ELLIPSE.cx} cy={ELLIPSE.cy} rx={ELLIPSE.rx} ry={ELLIPSE.ry} />
      ) : (
        <path d={path} />
      )}
    </svg>
  )
}
