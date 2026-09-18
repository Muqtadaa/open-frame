import { useEffect, useRef } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { useKeyboardShortcuts } from '../interaction/use-keyboard-shortcuts.js'
import { GRID_SIZE } from '../scene/snapping.js'
import { ConnectorPreview } from './ConnectorPreview.js'
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
 * Background dots, positioned so they sit on WORLD grid lines.
 *
 * Painted on the canvas element rather than the world layer — a background that
 * scaled with the transform would blur and would repaint an enormous area when
 * zoomed out. Offsetting by the viewport modulo the cell size gives the same
 * result at constant cost.
 *
 * Below a threshold the dots are dropped entirely: at 20% zoom they would be
 * two pixels apart and read as noise.
 */
const MIN_GRID_ZOOM = 0.4

function gridStyle(viewport: { x: number; y: number; zoom: number }): React.CSSProperties {
  const cell = GRID_SIZE * viewport.zoom
  if (viewport.zoom < MIN_GRID_ZOOM) return { backgroundImage: 'none' }
  return {
    backgroundSize: `${String(cell)}px ${String(cell)}px`,
    backgroundPosition: `${String(-viewport.x * viewport.zoom)}px ${String(-viewport.y * viewport.zoom)}px`,
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
        <ConnectorPreview />
      </div>
    </div>
  )
}
