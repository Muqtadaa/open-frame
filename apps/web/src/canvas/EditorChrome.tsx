import { type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { worldToScreen, type ObjectId, type Rect } from '@openframe/core'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { RAIL_CLEARANCE_PX } from '../scene/rail-footprint.js'
import { type Side } from '../scene/anchoring.js'

/**
 * Apparatus placed beside a WORLD rectangle.
 *
 * The board is drawn by one `scale(zoom)` on a wrapper, so anything anchored
 * inside it is in world coordinates — this converts those to the screen and
 * hands the rest to `AnchoredSurface`, which is where placement actually
 * happens for everything in the product.
 *
 * Two coordinate systems for two kinds of chrome, decided by whichever file
 * the author happened to be working in, is what this replaced: a table's
 * colour bar and its row controls were rendered inside the object's editor,
 * inside the world transform, so they were multiplied by the zoom and pinned
 * to an edge that is itself off the window once you zoom in.
 */
export function ChromeSurface({
  bounds,
  prefer,
  testId,
  avoid,
  children,
}: {
  /** The WORLD rectangle this belongs beside. */
  readonly bounds: Rect | null
  /**
   * Sides to try, in order.
   *
   * The caller names them because more than one piece of apparatus can belong
   * to one thing, and left to a single default they all pick the same side and
   * stack on each other — which is exactly what a table's three did.
   */
  readonly prefer?: readonly Side[] | undefined
  readonly testId?: string | undefined
  /** A screen rectangle this should not land on, if any side avoids it. */
  readonly avoid?: Rect | null | undefined
  readonly children: ReactNode
}) {
  const viewport = useInteractionStore((state) => state.viewport)
  const canvasSize = useInteractionStore((state) => state.canvasSize)

  if (bounds === null) return null

  const topLeft = worldToScreen(viewport, { x: bounds.x, y: bounds.y })
  const bottomRight = worldToScreen(viewport, {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
  })

  return (
    <AnchoredSurface
      anchor={{
        x: topLeft.x,
        y: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      }}
      surface={canvasSize}
      prefer={prefer}
      keepClearLeft={RAIL_CLEARANCE_PX}
      avoid={avoid}
      testId={testId}
    >
      {children}
    </AnchoredSurface>
  )
}

/**
 * A type's own apparatus, anchored to the OBJECT it belongs to.
 *
 * The view says what the apparatus belongs beside as a fraction of its own
 * extent — the unit a divider and a comment pin already use — and this
 * resolves that against the object's real bounds before handing the rest to
 * the surface above. Bounds come from the REGISTRY, never from `object.frame`:
 * a connector's extent is wherever its endpoints resolve to.
 */
export function EditorChrome({
  objectId,
  anchor,
  prefer,
  children,
}: {
  readonly objectId: ObjectId
  /** What to sit beside, as a fraction of those bounds. `null` is all of it. */
  readonly anchor?: Rect | null | undefined
  readonly prefer?: readonly Side[] | undefined
  readonly children: ReactNode
}) {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()

  const object = document.objects.get(objectId)
  if (object === undefined) return null

  const bounds = runtime.registry.boundsOf(object, document)
  const region =
    anchor === undefined || anchor === null
      ? bounds
      : {
          x: bounds.x + bounds.width * anchor.x,
          y: bounds.y + bounds.height * anchor.y,
          width: bounds.width * anchor.width,
          height: bounds.height * anchor.height,
        }

  return (
    <ChromeSurface bounds={region} prefer={prefer}>
      {children}
    </ChromeSurface>
  )
}

/**
 * Apparatus drawn ON an object rather than beside it, in screen space.
 *
 * `EditorChrome` finds a free side and floats a surface there, which is right
 * for a bar and wrong for anything that has to line up with the object's own
 * geometry: a spreadsheet's column letters sit exactly over its columns, and a
 * selection ring goes exactly round its cells. Those were drawn in the world
 * before, and a ring divided by the zoom is the rule 24 failure — it cannot be
 * painted thinner than one world pixel, so at 1600% it was sixteen on screen.
 *
 * So the view gets a `place` that turns a fraction of its own extent into a
 * screen rectangle, and draws into the chrome layer with lengths that are what
 * they say. Placement is still not the view's: it names fractions, as it does
 * for `Chrome`, and never sees a viewport.
 */
export function EditorOverlay({
  objectId,
  children,
}: {
  readonly objectId: ObjectId
  readonly children: (place: (fraction: Rect) => Rect) => ReactNode
}) {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const viewport = useInteractionStore((state) => state.viewport)

  const object = document.objects.get(objectId)
  const target =
    typeof window === 'undefined'
      ? null
      : window.document.querySelector<HTMLElement>('[data-chrome-layer]')
  if (object === undefined || target === null) return null

  const bounds = runtime.registry.boundsOf(object, document)
  const place = (fraction: Rect): Rect => {
    const topLeft = worldToScreen(viewport, {
      x: bounds.x + bounds.width * fraction.x,
      y: bounds.y + bounds.height * fraction.y,
    })
    const bottomRight = worldToScreen(viewport, {
      x: bounds.x + bounds.width * (fraction.x + fraction.width),
      y: bounds.y + bounds.height * (fraction.y + fraction.height),
    })
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    }
  }

  /*
   * The same load-bearing `of-editor-chrome` marker the surfaces carry: a
   * press on a column letter is the editor's, not the board's. The layer
   * itself lets the pointer through, and what is drawn on it decides.
   */
  return createPortal(
    <div className="of-editor-chrome of-editor-overlay" data-testid="object-overlay">
      {children(place)}
    </div>,
    target,
  )
}
