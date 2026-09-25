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
import { FitIcon, GridIcon, MinusIcon, MouseIcon, PlusIcon } from '../controls/icons.js'
import { MOD_KEY } from '../interaction/keymap.js'

const mod = MOD_KEY

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
  const readout = useRef<HTMLButtonElement>(null)
  // Enter and Escape hand the keyboard back to the readout, as the board's
  // name does: the field unmounting used to drop it on the page.
  const returnFocus = useRef(false)

  useEffect(() => {
    if (editing) inputRef.current?.select()
    else if (returnFocus.current) {
      returnFocus.current = false
      readout.current?.focus()
    }
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
        data-tip={`Scroll wheel: ${wheelMode === 'zoom' ? 'zoom' : 'pan'} — click to switch`}
        aria-description={`Scroll wheel: ${wheelMode === 'zoom' ? 'zoom' : 'pan'} — click to switch`}
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
        data-tip={`Snap to grid: ${snapToGrid ? 'on' : 'off'} — hold ${mod} while dragging to override`}
        aria-description={`Snap to grid: ${snapToGrid ? 'on' : 'off'} — hold ${mod} while dragging to override`}
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
        data-tip={`Zoom out (${mod}−)`}
        aria-description={`Zoom out (${mod}−)`}
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
        data-tip={`Zoom in (${mod}+)`}
        aria-description={`Zoom in (${mod}+)`}
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
            /*
             * Both PREVENTED: focus goes back to the readout inside this very
             * keydown, and an Enter left to its default then presses the
             * readout it landed on — which opens the field again.
             */
            if (event.key === 'Enter') {
              event.preventDefault()
              returnFocus.current = true
              commitDraft()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              returnFocus.current = true
              setEditing(false)
            }
            event.stopPropagation()
          }}
        />
      ) : (
        <button
          ref={readout}
          type="button"
          className="of-zoom__percent"
          aria-label={`Zoom ${String(percent)}%`}
          data-tip={`Reset to 100% (${mod}0)`}
          aria-description={`Reset to 100% (${mod}0)`}
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
        data-tip={`Zoom to fit (${mod}1)`}
        aria-description={`Zoom to fit (${mod}1)`}
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
