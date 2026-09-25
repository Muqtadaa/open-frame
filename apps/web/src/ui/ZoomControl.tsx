import { MAX_ZOOM, MIN_ZOOM, clampZoom } from '@openframe/core'
import { useEffect, useRef, useState } from 'react'

import { useOpenFrame } from '../runtime/context.js'
import {
  fitToDocument,
  nextZoomIn,
  nextZoomOut,
  sliderToZoom,
  zoomAtCentre,
  zoomToSlider,
} from '../scene/zoom.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { FitIcon, GridIcon, MinusIcon, MouseIcon, PlusIcon } from './icons.js'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = isMac ? '⌘' : 'Ctrl'

/**
 * Zoom slider, percentage entry and fit, plus the scroll-behaviour toggle.
 *
 * The scroll toggle lives here rather than in a settings screen because it is
 * the control people reach for at the exact moment the behaviour surprises
 * them — which is while they are zooming.
 */
export function ZoomControl() {
  const viewport = useInteractionStore((state) => state.viewport)
  const setViewport = useInteractionStore((state) => state.setViewport)
  const wheelMode = useInteractionStore((state) => state.wheelMode)
  const toggleWheelMode = useInteractionStore((state) => state.toggleWheelMode)
  const snapToGrid = useInteractionStore((state) => state.snapToGrid)
  const toggleSnapToGrid = useInteractionStore((state) => state.toggleSnapToGrid)
  const { width, height } = useInteractionStore((state) => state.canvasSize)
  const { runtime } = useOpenFrame()

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const applyZoom = (zoom: number): void => {
    setViewport(zoomAtCentre(viewport, width, height, zoom))
  }

  const commitDraft = (): void => {
    const parsed = Number.parseFloat(draft.replace('%', '').trim())
    if (Number.isFinite(parsed) && parsed > 0) applyZoom(clampZoom(parsed / 100))
    setEditing(false)
  }

  const percent = Math.round(viewport.zoom * 100)

  return (
    <div className="of-zoom" data-testid="zoom-control">
      <button
        type="button"
        className="of-icon-button"
        aria-label={`Scroll wheel currently ${wheelMode === 'zoom' ? 'zooms' : 'pans'}. Click to switch.`}
        title={`Scroll wheel: ${wheelMode === 'zoom' ? 'zoom' : 'pan'} — click to switch`}
        data-testid="wheel-mode"
        data-mode={wheelMode}
        onClick={() => toggleWheelMode()}
      >
        <MouseIcon />
        <span className="of-zoom__mode">{wheelMode}</span>
      </button>

      <button
        type="button"
        className={`of-icon-button${snapToGrid ? ' of-icon-button--on' : ''}`}
        aria-pressed={snapToGrid}
        aria-label={`Snap to grid ${snapToGrid ? 'on' : 'off'}. Hold ${mod} while dragging to override.`}
        title={`Snap to grid: ${snapToGrid ? 'on' : 'off'} — hold ${mod} while dragging to override`}
        data-testid="snap-toggle"
        data-snap={snapToGrid ? 'on' : 'off'}
        onClick={() => toggleSnapToGrid()}
      >
        <GridIcon />
      </button>

      <span className="of-zoom__sep" />

      <button
        type="button"
        className="of-icon-button"
        aria-label="Zoom out"
        title={`Zoom out (${mod}−)`}
        data-testid="zoom-out"
        disabled={viewport.zoom <= MIN_ZOOM + 1e-6}
        onClick={() => applyZoom(nextZoomOut(viewport.zoom))}
      >
        <MinusIcon />
      </button>

      <input
        className="of-zoom__slider"
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={zoomToSlider(viewport.zoom)}
        aria-label="Zoom level"
        data-testid="zoom-slider"
        // Logarithmic: a linear slider would put half its travel above 8x.
        onChange={(event) => applyZoom(sliderToZoom(Number(event.target.value)))}
      />

      <button
        type="button"
        className="of-icon-button"
        aria-label="Zoom in"
        title={`Zoom in (${mod}+)`}
        data-testid="zoom-in"
        disabled={viewport.zoom >= MAX_ZOOM - 1e-6}
        onClick={() => applyZoom(nextZoomIn(viewport.zoom))}
      >
        <PlusIcon />
      </button>

      {editing ? (
        <input
          ref={inputRef}
          className="of-zoom__input"
          value={draft}
          aria-label="Zoom percentage"
          data-testid="zoom-input"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitDraft()
            if (event.key === 'Escape') setEditing(false)
            event.stopPropagation()
          }}
        />
      ) : (
        <button
          type="button"
          className="of-zoom__percent"
          title={`Reset to 100% (${mod}0)`}
          data-testid="zoom-percent"
          onClick={() => {
            setDraft(String(percent))
            setEditing(true)
          }}
        >
          {percent}%
        </button>
      )}

      <button
        type="button"
        className="of-icon-button"
        aria-label="Zoom to fit"
        title={`Zoom to fit (${mod}1)`}
        data-testid="zoom-fit"
        onClick={() => {
          const next = fitToDocument(runtime.store.getDocument(), runtime.registry, width, height)
          if (next !== null) setViewport(next)
        }}
      >
        <FitIcon />
      </button>
    </div>
  )
}
