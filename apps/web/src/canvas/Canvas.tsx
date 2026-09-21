import { useEffect, useRef } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { useKeyboardShortcuts } from '../interaction/use-keyboard-shortcuts.js'
import { gridStyle } from '../scene/grid.js'
import { AlignmentOverlay } from './AlignmentOverlay.js'
import { ConnectorPreview } from './ConnectorPreview.js'
import { ConnectPoints } from './ConnectPoints.js'
import { DrawPreview } from './DrawPreview.js'
import { EndpointOverlay } from './EndpointOverlay.js'
import { ArrangeBar } from './ArrangeBar.js'
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

  return (
    <div
      ref={containerRef}
      className={`of-canvas of-canvas--${tool}`}
      style={gridStyle(viewport)}
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
        <SelectionOverlay />
        <ConnectPoints />
        <DrawPreview />
        <MarqueeOverlay />
        <AlignmentOverlay />
        <EndpointOverlay />
        <DividerOverlay />
        <ConnectorPreview />
        {/*
          Rendered here but PORTALED out, like every other piece of apparatus:
          it lives inside the world tree so it sees the selection and the
          document, and lands on the screen-space layer so it is not multiplied
          by the zoom.
        */}
        <ArrangeBar />
        {/*
          Last, so other people's cursors sit above the board and every overlay
          on it — a cursor behind a note is a cursor nobody can follow.
        */}
        <PresenceLayer />
        {/*
          Inside the world, so a pin sits exactly where it was dropped under
          any pan or zoom. The words are outside it, in the panel: text that
          scales with the board cannot be read at 25%.
        */}
        <CommentLayer />
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
