import { useRef } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { useKeyboardShortcuts } from '../interaction/use-keyboard-shortcuts.js'
import { MarqueeOverlay } from './MarqueeOverlay.js'
import { ObjectLayer } from './ObjectLayer.js'
import { useCanvasGestures } from './use-canvas-gestures.js'
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
export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { width, height } = useCanvasSize(containerRef)
  const viewport = useInteractionStore((state) => state.viewport)
  const tool = useInteractionStore((state) => state.tool)
  const gestures = useCanvasGestures(containerRef)
  useKeyboardShortcuts(gestures.setSpaceHeld)

  return (
    <div
      ref={containerRef}
      className={`of-canvas of-canvas--${tool}`}
      data-testid="canvas"
      role="application"
      aria-label="OpenFrame board canvas"
      onPointerDown={gestures.onPointerDown}
      onPointerMove={gestures.onPointerMove}
      onPointerUp={gestures.onPointerUp}
      onPointerCancel={gestures.onPointerUp}
      onDoubleClick={gestures.onDoubleClick}
      onWheel={gestures.onWheel}
    >
      <div
        className="of-world"
        style={{
          transform: `scale(${String(viewport.zoom)}) translate(${String(-viewport.x)}px, ${String(-viewport.y)}px)`,
        }}
      >
        <ObjectLayer width={width} height={height} />
        <MarqueeOverlay />
      </div>
    </div>
  )
}
