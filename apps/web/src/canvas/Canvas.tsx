import { useEffect, useMemo, useRef, type CSSProperties } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { cursorFor } from '../interaction/tool-cursor.js'
import { useCursorInk } from '../hooks/use-cursor-ink.js'
import { useKeyboardShortcuts } from '../interaction/use-keyboard-shortcuts.js'
import { gridStyle } from '../scene/grid.js'
import { AlignmentOverlay } from './AlignmentOverlay.js'
import { ConnectorPreview } from './ConnectorPreview.js'
import { ConnectPoints } from './ConnectPoints.js'
import { DrawPreview } from './DrawPreview.js'
import { EndpointOverlay } from './EndpointOverlay.js'
import { ArrangeBar } from './ArrangeBar.js'
import { CropOverlay } from './CropOverlay.js'
import { DividerOverlay } from './DividerOverlay.js'
import { MarqueeOverlay } from './MarqueeOverlay.js'
import { ObjectLayer } from './ObjectLayer.js'
import { CommentLayer } from './CommentLayer.js'
import { PresenceLayer } from './PresenceLayer.js'
import { usePresence } from './use-presence.js'
import { useFollow } from './use-follow.js'
import { SelectionOverlay } from './SelectionOverlay.js'
import { useCanvasGestures } from './use-canvas-gestures.js'
import { useImageDrop } from './use-image-drop.js'
import { useWheelGesture } from './use-wheel-gesture.js'
import { useCanvasSize } from './use-canvas-size.js'
import { useMoving } from './use-moving.js'

/**
 * The canvas surface.
 *
 * Deliberately small. Sizing, gesture interpretation, keyboard handling,
 * culling and object rendering each live in their own module — this component
 * only composes them and applies the viewport transform. A `Canvas.tsx` that
 * accumulated all of that is the god-component the architecture forbids.
 *
 * Pan and zoom are ONE CSS transform on the world layer, so panning a board
 * with hundreds of objects moves a single compositor layer rather than
 * repositioning every element.
 */
/**
 * The quadrille: the ruled ground the board is written on.
 *
 * Two weights, and the heavier one is not decoration. `GRID_SIZE` is 10 world
 * units and snapping lands on it, so the decade line marks the rule you are
 * actually aiming at — the same relationship a computation pad has between its
 * fine grid and its heavier tenth.
 *
 * Painted on the canvas element rather than the world layer: a background that
 * scaled with the transform would blur, and would repaint an enormous area when
 * zoomed out. Offsetting by the viewport modulo the cell gives the same result
 * at constant cost. How the levels themselves are chosen lives in `scene/grid.ts`.
 */
export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { width, height } = useCanvasSize(containerRef)
  const setCanvasSize = useInteractionStore((state) => state.setCanvasSize)
  const viewport = useInteractionStore((state) => state.viewport)
  const tool = useInteractionStore((state) => state.tool)
  const shapeKind = useInteractionStore((state) => state.shapeKind)
  const gestures = useCanvasGestures(containerRef)
  // Promotes the world layer only while it is actually moving — see use-moving.
  const moving = useMoving()
  // Wheel is handled by a native non-passive listener rather than an onWheel
  // prop — see use-wheel-gesture.ts for why that is not optional.
  useWheelGesture(containerRef)
  useKeyboardShortcuts(gestures.setSpaceHeld)
  const imageDrop = useImageDrop(containerRef)
  // Publishes this person's cursor and claims, and keeps the advisory lock in
  // step with everybody else's. A no-op on a board that is nobody else's.
  usePresence(containerRef)
  // Rides another person's viewport, when this one has chosen to.
  useFollow()

  useEffect(() => {
    setCanvasSize(width, height)
  }, [setCanvasSize, width, height])

  /*
   * Built once per tool, variant and theme rather than per render: it is a
   * string of a kilobyte and this component re-renders on every pointer move.
   *
   * The SHAPE variant is in the key because the rail's icon follows it and so
   * should the pointer — a cursor showing a rectangle while the rail shows a
   * diamond is the interface disagreeing with itself.
   */
  const ink = useCursorInk()
  const toolCursor = useMemo(() => cursorFor(tool, shapeKind, ink), [tool, shapeKind, ink])

  return (
    <div
      ref={containerRef}
      /*
       * `--aiming` is "a tool is armed", which is one question; WHICH tool is
       * a custom property rather than a class, because the answer is an image
       * and a stylesheet cannot hold ten of those without holding the icons
       * twice.
       */
      className={`of-canvas of-canvas--${tool}${toolCursor === null ? '' : ' of-canvas--aiming'}`}
      style={
        toolCursor === null
          ? gridStyle(viewport)
          : /*
             * A custom property is not in React's `CSSProperties`, which only
             * knows the named ones. The cast is the narrowest way to say
             * "this is a CSS variable" without loosening the whole object.
             */
            ({ ...gridStyle(viewport), '--of-tool-cursor': toolCursor } as CSSProperties)
      }
      data-testid="canvas"
      role="application"
      aria-label="OpenFrame board canvas"
      onPointerDown={gestures.onPointerDown}
      onPointerMove={gestures.onPointerMove}
      onPointerUp={gestures.onPointerUp}
      onPointerCancel={gestures.onPointerUp}
      onDoubleClick={gestures.onDoubleClick}
      onContextMenu={gestures.onContextMenu}
      onDragOver={imageDrop.onDragOver}
      onDrop={imageDrop.onDrop}
    >
      <div
        className={`of-world${moving ? ' of-world--moving' : ''}`}
        style={{
          transform: `scale(${String(viewport.zoom)}) translate(${String(-viewport.x)}px, ${String(-viewport.y)}px)`,
        }}
      >
        <ObjectLayer width={width} height={height} />
      </div>

      {/*
       * APPARATUS, at screen size.
       *
       * Everything here is measured in screen pixels and positioned from the
       * viewport, because none of it is part of the board: a handle is 9px at
       * 5% and at 1600% alike. Inside the world transform that is not
       * expressible — see `.of-apparatus` in styles.css for what fails.
       */}
      <div className="of-apparatus" data-apparatus-layer>
        <SelectionOverlay />
        <ConnectPoints />
        <DrawPreview />
        <MarqueeOverlay />
        <AlignmentOverlay />
        <EndpointOverlay />
        <DividerOverlay />
        <CropOverlay />
        <ConnectorPreview />
        {/*
          Rendered here but PORTALED out, like every other piece of apparatus:
          it lives inside the tree so it sees the selection and the document,
          and lands on the chrome layer so it can be clamped to the window.
        */}
        <ArrangeBar />
        {/*
          A pin is above the grips: it is the only way to open the thread under
          it, and one on the edge of a selected object was covered by that
          object's handles. The words are elsewhere, in the panel — text that
          scaled with the board could not be read at 25%.
        */}
        <CommentLayer />
        {/*
          Last, so other people's cursors sit above the board and every overlay
          on it — a cursor behind a note is a cursor nobody can follow.
        */}
        <PresenceLayer />
      </div>

      {/*
       * Where a type's own apparatus lands: OUTSIDE the world transform, so
       * it is the same size on screen at every zoom and can be clamped to the
       * window. Empty until something is being edited.
       */}
      <div className="of-chrome-layer" data-chrome-layer />
    </div>
  )
}
