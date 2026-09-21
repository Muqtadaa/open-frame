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
 * Apparatus, lifted out of the world and placed on the screen beside a
 * rectangle.
 *
 * This is the layer that did not exist. A table's colour bar and its row and
 * column controls were rendered inside the object's editor, which is inside
 * the world transform — so they were multiplied by the zoom, and they were
 * pinned to an edge that is itself off the window once you zoom in. Two
 * coordinate systems for two kinds of chrome, decided by whichever file the
 * author happened to be working in.
 *
 * It takes a WORLD RECTANGLE rather than an object, because not everything
 * that floats beside something belongs to one object: the arrange bar belongs
 * to a selection, which is several. `EditorChrome` below is the object-shaped
 * caller, and is what a view receives.
 *
 * This is the only thing that decides where apparatus goes, and
 * `chrome-contract.test.ts` holds it to that — if a second placement appears,
 * the split this replaced has grown back.
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
   * stack on each other — which is exactly what a table's three did. The
   * canvas still decides whether the chosen side FITS and clamps the result;
   * this is a preference, not a position.
   */
  readonly prefer?: readonly Side[] | undefined
  readonly testId?: string | undefined
  /** A screen rectangle this should not land on, if any side avoids it. */
  readonly avoid?: Rect | null | undefined
  readonly children: ReactNode
}) {
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

  const target =
    typeof window === 'undefined'
      ? null
      : window.document.querySelector<HTMLElement>('[data-chrome-layer]')
  if (target === null || bounds === null) return null

  const topLeft = worldToScreen(viewport, { x: bounds.x, y: bounds.y })
  const bottomRight = worldToScreen(viewport, {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
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
    avoid,
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
      data-testid={testId ?? 'object-chrome'}
      data-side={placed.side}
      style={{ transform: `translate(${String(placed.x)}px, ${String(placed.y)}px)` }}
    >
      {children}
    </div>,
    target,
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
