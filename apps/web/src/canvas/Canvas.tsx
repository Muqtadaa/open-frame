import { useEffect, useRef } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { useKeyboardShortcuts } from '../interaction/use-keyboard-shortcuts.js'
import { GRID_SIZE } from '../scene/snapping.js'
import { AlignmentOverlay } from './AlignmentOverlay.js'
import { ConnectorPreview } from './ConnectorPreview.js'
import { EndpointOverlay } from './EndpointOverlay.js'
import { MarqueeOverlay } from './MarqueeOverlay.js'
import { ObjectLayer } from './ObjectLayer.js'
import { SelectionOverlay } from './SelectionOverlay.js'
import { useCanvasGestures } from './use-canvas-gestures.js'
import { useImageDrop } from './use-image-drop.js'
import { useWheelGesture } from './use-wheel-gesture.js'
import { useCanvasSize } from './use-canvas-size.js'

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
 * at constant cost.
 *
 * The fine rule is 10 world units, so at 100% it lands every 10 screen pixels.
 * That density is correct — it is what quadrille IS — but only at the right
 * weight: drawn as strongly as the decade it reads as noise, and dropping it
 * instead leaves 100px cells that read as tiles rather than as a ruled page.
 * The answer was ink, not spacing, so every weight is faint.
 *
 * THREE weights, because `ZOOM_STEPS` reaches 0.05. With only two, both dropped
 * out below 12% and the board became a flat, unruled void — the neutral canvas
 * this design exists to refuse, appearing exactly when someone zooms out to
 * survey the whole record. The century rule takes over there, so the page is
 * ruled at every reachable zoom.
 */
const MIN_RULE_ZOOM = 0.7
const MIN_DECADE_ZOOM = 0.12

function gridStyle(viewport: { x: number; y: number; zoom: number }): React.CSSProperties {
  const fine = GRID_SIZE * viewport.zoom
  const offsetX = -viewport.x * viewport.zoom
  const offsetY = -viewport.y * viewport.zoom

  const layers: string[] = []
  const sizes: string[] = []
  const rule = (cell: number, token: string): void => {
    layers.push(
      `linear-gradient(to right, var(${token}) 1px, transparent 1px)`,
      `linear-gradient(to bottom, var(${token}) 1px, transparent 1px)`,
    )
    sizes.push(`${String(cell)}px ${String(cell)}px`, `${String(cell)}px ${String(cell)}px`)
  }

  if (viewport.zoom >= MIN_RULE_ZOOM) rule(fine, '--of-rule')
  if (viewport.zoom >= MIN_DECADE_ZOOM) rule(fine * 10, '--of-rule-decade')
  else rule(fine * 100, '--of-rule-decade')

  return {
    backgroundImage: layers.join(', '),
    backgroundSize: sizes.join(', '),
    backgroundPosition: layers.map(() => `${String(offsetX)}px ${String(offsetY)}px`).join(', '),
  }
}

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { width, height } = useCanvasSize(containerRef)
  const setCanvasSize = useInteractionStore((state) => state.setCanvasSize)
  const viewport = useInteractionStore((state) => state.viewport)
  const tool = useInteractionStore((state) => state.tool)
  const gestures = useCanvasGestures(containerRef)
  // Wheel is handled by a native non-passive listener rather than an onWheel
  // prop — see use-wheel-gesture.ts for why that is not optional.
  useWheelGesture(containerRef)
  useKeyboardShortcuts(gestures.setSpaceHeld)
  const imageDrop = useImageDrop(containerRef)

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
        className="of-world"
        style={{
          transform: `scale(${String(viewport.zoom)}) translate(${String(-viewport.x)}px, ${String(-viewport.y)}px)`,
        }}
      >
        <ObjectLayer width={width} height={height} />
        <SelectionOverlay />
        <MarqueeOverlay />
        <AlignmentOverlay />
        <EndpointOverlay />
        <ConnectorPreview />
      </div>
    </div>
  )
}
