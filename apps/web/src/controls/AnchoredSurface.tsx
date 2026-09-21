import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { placeAnchored, type Rect, type Side, type Size } from '../scene/anchoring.js'

/**
 * Anything that floats beside something else, placed once and placed the same.
 *
 * THE one surface. A table's colour bar, a code block's language menu, the
 * arrange bar, the tool rail's two flyouts — each was placed by its own
 * arithmetic, which is why they behaved differently at the edges of the window
 * and why some of them left it entirely. The rail's table picker ran 48 pixels
 * off the bottom of a 420-pixel window, where nothing could reach it.
 *
 * It takes a SCREEN rectangle, which is the common denominator: a rail button
 * already has one, and `ChromeSurface` converts an object's world bounds into
 * one before calling here. That is why this lives in `controls/` — a leaf both
 * the canvas and the interface may import, which neither could do if it sat in
 * the other's folder.
 *
 * This is the only thing that decides where apparatus goes, and
 * `chrome-contract.test.ts` holds it to that.
 */
export function AnchoredSurface({
  anchor,
  surface: within,
  prefer,
  gap = 8,
  margin = 12,
  keepClearLeft,
  avoid,
  testId,
  children,
}: {
  /** What this belongs beside, in screen pixels. */
  readonly anchor: Rect | null
  /** The window it must stay inside. */
  readonly surface: Size
  readonly prefer?: readonly Side[] | undefined
  readonly gap?: number | undefined
  readonly margin?: number | undefined
  /** A band on the left it may not enter — the tool rail's footprint. */
  readonly keepClearLeft?: number | undefined
  /** Another floating surface to stay off, if any side avoids it. */
  readonly avoid?: Rect | null | undefined
  readonly testId?: string | undefined
  readonly children: ReactNode
}) {
  const element = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 260, height: 100 })

  /*
   * MEASURED, not estimated. A bar whose width depends on how many controls a
   * type declares cannot be guessed at all.
   *
   * No dependency list ON PURPOSE, and the lint rule is right to ask: the
   * surface resizes when its own contents change and there is no value to list
   * that captures that. `[]` would measure once and place every later shape
   * with the first one's size. What makes it safe is the comparison below —
   * React bails out of a `setState` returning the same reference, so the chain
   * stops after one pass instead of rendering forever, which it did until the
   * guard was added.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const box = element.current?.getBoundingClientRect()
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
  if (target === null || anchor === null) return null

  const placed = placeAnchored({
    anchor,
    surface: size,
    within,
    prefer: prefer ?? ['above', 'below', 'right', 'left'],
    gap,
    margin,
    keepClearLeft,
    avoid,
  })

  return createPortal(
    <div
      ref={element}
      /*
       * `of-editor-chrome` is load-bearing, not decoration. The canvas blurs
       * whatever is being typed into on any press it reads as a board gesture,
       * and this marker is what tells it a press belongs to apparatus instead.
       * It has been missed four times — the format bar, the table's buttons,
       * the code menu, and the whole layer when apparatus was lifted out of
       * the object — and every one presented as a control that was visible and
       * could not be used.
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
