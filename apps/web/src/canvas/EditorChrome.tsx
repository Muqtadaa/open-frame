import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { worldToScreen, type ObjectId, type Rect } from '@openframe/core'

import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { placeAnchored, type Side } from '../scene/anchoring.js'

/** The tool rail's footprint, which no floating surface may enter. */
const RAIL_CLEARANCE_PX = 84
const MARGIN_PX = 12
const GAP_PX = 8

/**
 * A type's own apparatus, lifted out of the world and placed on the screen.
 *
 * This is the layer that did not exist. A table's colour bar and its row and
 * column controls were rendered inside the object's editor, which is inside
 * the world transform — so they were multiplied by the zoom, and they were
 * pinned to an edge that is itself off the window once you zoom in. Two
 * coordinate systems for two kinds of chrome, decided by whichever file the
 * author happened to be working in.
 *
 * The VIEW never sees any of this. It receives this component as a prop and
 * renders its apparatus into it, so a leaf that may not import the canvas, the
 * runtime or the interaction store still gets placement that knows about all
 * three. It says what the apparatus belongs beside, as a fraction of its own
 * extent — the unit a divider and a comment pin already use — and this
 * resolves the rest.
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
  /**
   * Sides to try, in order.
   *
   * The view names them because more than one piece of apparatus can belong to
   * one object, and left to a single default they all pick the same side and
   * stack on each other — which is exactly what a table's three did. The
   * canvas still decides whether the chosen side FITS and clamps the result;
   * this is a preference, not a position.
   */
  readonly prefer?: readonly Side[] | undefined
  readonly children: ReactNode
}) {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const viewport = useInteractionStore((state) => state.viewport)
  const canvasSize = useInteractionStore((state) => state.canvasSize)
  const surface = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 260, height: 100 })

  /*
   * MEASURED, not estimated. The record panel guesses its height with a
   * constant and says so; a bar whose width depends on how many controls a
   * type declares cannot be guessed at all. The guard makes this settle after
   * one pass instead of looping — a `setState` in a layout effect that always
   * fires is an infinite render, which this did until the comparison was added.
   */
  /*
   * No dependency list ON PURPOSE, and the lint rule is right to ask.
   *
   * The surface resizes when its own contents change — a different colour
   * target, a longer count — and there is no value to list that captures that.
   * `[]` would measure once and then place every later shape of the bar with
   * the first one's size. What makes it safe is the comparison below: React
   * bails out of a `setState` that returns the same reference, so the chain
   * stops after one pass rather than running forever.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const box = surface.current?.getBoundingClientRect()
    if (box === undefined) return
    setSize((old) =>
      Math.abs(old.width - box.width) < 1 && Math.abs(old.height - box.height) < 1
        ? old
        : { width: box.width, height: box.height },
    )
  })

  const object = document.objects.get(objectId)
  const target =
    typeof window === 'undefined'
      ? null
      : window.document.querySelector<HTMLElement>('[data-chrome-layer]')
  if (target === null || object === undefined) return null

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

  const topLeft = worldToScreen(viewport, { x: region.x, y: region.y })
  const bottomRight = worldToScreen(viewport, {
    x: region.x + region.width,
    y: region.y + region.height,
  })

  const placed = placeAnchored({
    anchor: {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    },
    surface: size,
    within: canvasSize,
    prefer: prefer ?? ['above', 'below', 'right', 'left'],
    gap: GAP_PX,
    margin: MARGIN_PX,
    keepClearLeft: RAIL_CLEARANCE_PX,
  })

  return createPortal(
    <div
      ref={surface}
      /*
       * `of-editor-chrome` is load-bearing, not decoration. The canvas blurs
       * whatever is being typed into on any press it reads as a board gesture,
       * and this marker is what tells it a press belongs to an editor. Lifting
       * the apparatus out of the object took it outside the old marker, and a
       * click on a stepper closed the editor it was operating — the fourth
       * time this exact fault has appeared, after the format bar, the table
       * buttons and the code menu.
       */
      className="of-chrome of-editor-chrome"
      data-testid="object-chrome"
      data-side={placed.side}
      style={{ transform: `translate(${String(placed.x)}px, ${String(placed.y)}px)` }}
    >
      {children}
    </div>,
    target,
  )
}
