import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { placeAnchored, type Rect, type Side, type Size } from '../scene/anchoring.js'
import { furnitureBands, watchFurnitureBands } from './screen-furniture.js'

/**
 * Fired on the window when a floating surface lands somewhere new, or goes.
 *
 * Something that keeps clear of another surface reads where it is from the
 * DOM, and a surface settles only after it has measured itself — a render
 * later than whatever read it. The arrange bar read the record panel's old
 * place and, in a short window, sat on the panel's new one.
 */
export const CHROME_MOVED = 'openframe:chrome-moved'

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
  layer,
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
  /**
   * `menu` paints over every other surface in the layer. Surfaces otherwise
   * stack in the order they mounted, which put the record panel over an open
   * context menu whenever the panel was the later of the two to render —
   * clipping "Promote to evidence" out of the only place it lives.
   */
  readonly layer?: 'menu' | undefined
  readonly children: ReactNode
}) {
  const element = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 260, height: 100 })
  /*
   * The board's screen-edge furniture, which nothing anchored to a selection
   * may be clamped onto: it is anchored to the window and moves for nobody.
   */
  const [band, setBand] = useState(furnitureBands)
  useEffect(() => watchFurnitureBands(setBand), [])

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
    /*
     * The LAYOUT size, not the painted one. Surfaces rise in with a
     * `scale(0.985)`, and a bounding rect measured on the first frame is that
     * scaled box — nothing re-renders when the animation ends, so the surface
     * stayed placed as a slightly smaller one until something else moved.
     */
    const node = element.current
    if (node === null) return
    const box = { width: node.offsetWidth, height: node.offsetHeight }
    setSize((old) =>
      Math.abs(old.width - box.width) < 1 && Math.abs(old.height - box.height) < 1
        ? old
        : { width: box.width, height: box.height },
    )
  })

  /*
   * And when its contents change size WITHOUT this component rendering. The
   * effect above runs only when the surface itself re-renders, and a child
   * that renders on its own — the reaction bar, which mounts empty until it
   * knows who is reacting — grew to full width while the surface went on
   * placing it as nothing at all, straight over the record panel.
   */
  const observed = useRef<{ node: HTMLDivElement; observer: ResizeObserver } | null>(null)

  useLayoutEffect(() => {
    const node = element.current
    if (observed.current?.node === node) return
    observed.current?.observer.disconnect()
    observed.current = null
    if (node === null || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      setSize((old) =>
        Math.abs(old.width - node.offsetWidth) < 1 && Math.abs(old.height - node.offsetHeight) < 1
          ? old
          : { width: node.offsetWidth, height: node.offsetHeight },
      )
    })
    observer.observe(node)
    observed.current = { node, observer }
  })
  useEffect(
    () => () => {
      observed.current?.observer.disconnect()
      observed.current = null
    },
    [],
  )

  // Says so when this surface has landed somewhere new (see CHROME_MOVED).
  // No dependency list for the reason the measuring above has none.
  const landed = useRef<string | null>(null)
  useLayoutEffect(() => {
    const box = element.current?.getBoundingClientRect()
    const where =
      box === undefined
        ? null
        : `${String(box.x)},${String(box.y)},${String(box.width)},${String(box.height)}`
    if (where === landed.current) return
    landed.current = where
    window.dispatchEvent(new Event(CHROME_MOVED))
  })

  const target =
    typeof window === 'undefined'
      ? null
      : window.document.querySelector<HTMLElement>('[data-chrome-layer]')
  if (target === null || anchor === null) return null

  /*
   * The rail is furniture too, measured like the rest. A menu is exempt for
   * the reason below; everything else stays off it, which at phone width is
   * the difference between a sheet beside the rail and one lying over it.
   */
  const clearLeft =
    layer === 'menu' ? (keepClearLeft ?? 0) : Math.max(keepClearLeft ?? 0, band.left)

  const placed = placeAnchored({
    anchor,
    surface: size,
    within,
    prefer: prefer ?? ['above', 'below', 'right', 'left'],
    gap,
    margin,
    keepClearLeft: clearLeft,
    /*
     * A MENU is momentary and paints over everything, the furniture included,
     * so it keeps clear of nothing: made to dodge the navigation bar as well
     * as the zoom cluster, a context menu on a laptop-height window had less
     * room than it is tall and ran off the bottom.
     */
    keepClearBottom: layer === 'menu' ? 0 : band.bottom,
    keepClearTop: layer === 'menu' ? 0 : band.top,
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
      className={`of-chrome of-editor-chrome${layer === 'menu' ? ' of-chrome--menu' : ''}`}
      data-testid={testId ?? 'object-chrome'}
      data-side={placed.side}
      style={{
        transform: `translate(${String(placed.x)}px, ${String(placed.y)}px)`,
        /*
         * NEVER WIDER than the room between the rail and the far margin. A
         * 300px sheet on a 390px phone has 266px beside the rail; clamped, it
         * kept its width and its left edge, and its right third went off the
         * screen. Narrowed, its rows wrap instead.
         */
        maxWidth: `${String(Math.max(0, within.width - Math.max(margin, clearLeft) - margin))}px`,
      }}
    >
      {children}
    </div>,
    target,
  )
}
