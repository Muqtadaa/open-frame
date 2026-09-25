import { MAX_ZOOM, MIN_ZOOM, clampZoom } from '@openframe/core'
import { useEffect, useRef, useState } from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
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
import { FitIcon, MinusIcon, MouseIcon, PlusIcon, SnapIcon } from '../controls/icons.js'
import { MOD_KEY } from '../interaction/keymap.js'

const mod = MOD_KEY

/** The zooms most often wanted, offered to a pointer while the field is open. */
const PRESETS = [0.5, 1, 2] as const

/**
 * Why a typed zoom was refused, in the product's own words, or `null` for a
 * zoom it will take. Refused rather than clamped: 5000 quietly becoming 1600
 * is a zoom nobody asked for, arrived at without a word.
 */
export function refusalOf(typed: string): string | null {
  const parsed = Number.parseFloat(typed.replace('%', '').trim())
  if (!Number.isFinite(parsed)) return 'Type a number, like 150'
  const zoom = parsed / 100
  if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) {
    return `Zoom is ${String(Math.round(MIN_ZOOM * 100))}–${String(Math.round(MAX_ZOOM * 100))}%`
  }
  return null
}

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
  const [refused, setRefused] = useState<string | null>(null)
  const { ref: field, anchor, surface } = useAnchoredTo<HTMLDivElement>(editing)
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

  const close = (): void => {
    setRefused(null)
    setEditing(false)
  }

  /**
   * Takes the typed zoom, or says why not. `leaving` is a blur: the person has
   * gone elsewhere, so a zoom that cannot be taken is simply not taken —
   * holding the field open behind their back would trap the next click.
   */
  const commitDraft = (leaving = false): boolean => {
    const why = refusalOf(draft)
    if (why === null) {
      applyZoom(clampZoom(Number.parseFloat(draft.replace('%', '').trim()) / 100))
      close()
      return true
    }
    if (leaving) close()
    else setRefused(why)
    return false
  }

  const percent = Math.round(viewport.zoom * 100)

  return (
    <div className="of-zoom" data-testid="zoom-control">
      <button
        type="button"
        className="of-icon-button"
        // A name, not an instruction: what the wheel does now. The tip says
        // what a press changes it to.
        aria-label={`Scroll wheel ${wheelMode === 'zoom' ? 'zooms' : 'pans'}`}
        data-tip={`Scroll wheel: ${wheelMode} — click to ${wheelMode === 'zoom' ? 'pan' : 'zoom'} instead`}
        aria-description={`Click to ${wheelMode === 'zoom' ? 'pan' : 'zoom'} instead`}
        data-testid="wheel-mode"
        data-mode={wheelMode}
        onClick={() => toggleWheelMode()}
      >
        <MouseIcon />
        {/*
         * "wheel: zoom", not "zoom": beside the zoom controls, the bare word
         * read as the cluster's heading rather than as the setting it is.
         */}
        <span className="of-zoom__mode">wheel: {wheelMode}</span>
      </button>

      <button
        type="button"
        className={`of-icon-button${snapToGrid ? ' of-icon-button--on' : ''}`}
        aria-pressed={snapToGrid}
        // Named once; `aria-pressed` says whether it is on. The label said
        // "on" as well, so it was announced twice.
        aria-label="Snap to grid"
        data-tip={`Snap to grid: ${snapToGrid ? 'on' : 'off'} — hold ${mod} while dragging to override`}
        aria-description={`Hold ${mod} while dragging to override`}
        data-testid="snap-toggle"
        data-snap={snapToGrid ? 'on' : 'off'}
        onClick={() => toggleSnapToGrid()}
      >
        <SnapIcon />
      </button>

      {/*
       * The rule between how the board is HANDLED and how close you are to
       * it: the two settings to its left, zoom itself to its right.
       */}
      <span className="of-zoom__sep" aria-hidden="true" />

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
        // Read as the zoom it sets, not as the slider's raw position.
        aria-valuetext={`${String(percent)}%`}
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
        <div ref={field} className="of-zoom__field">
          <input
            ref={inputRef}
            className="of-zoom__input"
            value={draft}
            aria-label="Zoom percentage"
            aria-invalid={refused !== null}
            aria-errormessage={refused === null ? undefined : 'zoom-refused'}
            data-testid="zoom-input"
            onChange={(event) => {
              setDraft(event.target.value)
              setRefused(null)
            }}
            onBlur={() => {
              commitDraft(true)
            }}
            onKeyDown={(event) => {
              /*
               * Both PREVENTED: focus goes back to the readout inside this very
               * keydown, and an Enter left to its default then presses the
               * readout it landed on — which opens the field again.
               */
              if (event.key === 'Enter') {
                event.preventDefault()
                // Only a zoom that was taken hands the keyboard back; a refused
                // one keeps it in the field, beside the reason.
                returnFocus.current = true
                if (!commitDraft()) returnFocus.current = false
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                returnFocus.current = true
                close()
              }
              event.stopPropagation()
            }}
          />
          {/*
           * The common zooms, for a pointer, while the field is open — reset had
           * no pointer route at all, only a shortcut named in a tip that said
           * the click would do it. And the reason a typed zoom was refused,
           * where it was typed.
           */}
          <AnchoredSurface
            anchor={anchor}
            surface={surface}
            prefer={['above', 'below']}
            testId="zoom-presets-surface"
          >
            <div className="of-zoom__presets of-surface" role="group" aria-label="Zoom to">
              {refused !== null && (
                <p className="of-zoom__refused" id="zoom-refused" role="alert">
                  {refused}
                </p>
              )}
              <div className="of-zoom__preset-row">
                {PRESETS.map((zoom) => (
                  <button
                    key={zoom}
                    type="button"
                    className="of-zoom__preset"
                    data-testid={`zoom-preset-${String(zoom * 100)}`}
                    // The field keeps focus, so choosing is not also a blur.
                    onMouseDown={(event) => {
                      event.preventDefault()
                    }}
                    onClick={() => {
                      applyZoom(zoom)
                      close()
                    }}
                  >
                    {zoom * 100}%
                  </button>
                ))}
              </div>
            </div>
          </AnchoredSurface>
        </div>
      ) : (
        <button
          ref={readout}
          type="button"
          className="of-zoom__percent"
          aria-label={`Zoom ${String(percent)}%`}
          // What a press does, and the shortcut for the zoom people most want.
          data-tip={`Type a zoom level · ${mod}0 for 100%`}
          aria-description={`Type a zoom level · ${mod}0 for 100%`}
          data-testid="zoom-percent"
          onClick={() => {
            setDraft(String(percent))
            setRefused(null)
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
