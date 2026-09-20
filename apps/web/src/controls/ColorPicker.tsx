import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { parseHexColor, type ColorValue, type HexColor } from '@openframe/core'

import { contrastRatio, hexToHsv, hsvToHex, type Hsv } from '../scene/color.js'

/**
 * The eyedropper, where it exists.
 *
 * Chromium ships `EyeDropper`; Firefox and Safari have nothing equivalent and
 * no shim can substitute, because reading a pixel from outside the page is a
 * privilege only the browser can grant. The button is therefore ABSENT rather
 * than disabled where it cannot work — a permanently dead control teaches
 * people to distrust the panel it is in.
 */
interface EyeDropperApi {
  open: (options?: { signal?: AbortSignal }) => Promise<{ sRGBHex: string }>
}

function eyeDropper(): EyeDropperApi | null {
  const ctor = (window as unknown as { EyeDropper?: new () => EyeDropperApi }).EyeDropper
  return ctor === undefined ? null : new ctor()
}

/** AA for text. A ratio below this is the one worth saying out loud. */
const AA_TEXT = 4.5

export interface ColorPickerProps {
  /**
   * The colour to open on: the literal already set, or the resolved value of
   * whatever token is, so the wheel starts where the object already is.
   *
   * It used to fall back to a hardcoded blue when nothing was set, which is a
   * wheel that opens somewhere the object has never been — and it made a test
   * that typed that same blue pass without the picker doing anything, because
   * a controlled field handed its own value back fires no change at all.
   */
  readonly current: HexColor
  /**
   * The colour this one will be read against, already resolved to a hex, or
   * `null` when there is nothing single to compare with — a mixed selection,
   * or a property that is not text.
   */
  readonly against: HexColor | null
  readonly onPick: (color: ColorValue) => void
  readonly onClose: () => void
}

/**
 * Picking a colour that is not in the palette.
 *
 * Saturation and value on an area, hue on a slider, and the hex spelled out —
 * the arrangement every design tool uses, because it is the one people already
 * know how to aim at. What it writes is a literal, and `ObjectStyle` records
 * what that costs: a literal does not follow a theme.
 *
 * It also SAYS the contrast, which is the part a palette normally handles
 * silently. A token pair is proven at build time by `design-tokens.test.ts`;
 * a colour somebody picks cannot be, so the guarantee becomes a warning at the
 * moment of choosing rather than disappearing.
 */
export function ColorPicker({ current, against, onPick, onClose }: ColorPickerProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(current))
  const [typed, setTyped] = useState<string>(current)
  const area = useRef<HTMLDivElement>(null)
  const dropper = useMemo(() => eyeDropper(), [])

  const hex = hsvToHex(hsv)
  const ratio = against === null ? null : contrastRatio(hex, against)

  // Escape closes without applying anything further, the convention every
  // other transient surface in this app follows.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  const commit = (next: Hsv): void => {
    setHsv(next)
    const value = hsvToHex(next)
    setTyped(value)
    onPick(value)
  }

  const aim = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const box = area.current?.getBoundingClientRect()
    if (box === undefined) return
    const s = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    const v = 1 - Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))
    commit({ ...hsv, s, v })
  }

  return (
    <div className="of-picker" data-testid="color-picker" role="group" aria-label="Custom colour">
      {/*
        * Saturation across, value up. Two gradients over the pure hue: white
        * to transparent left-to-right, then black to transparent bottom-to-top
        * — the standard construction, and the reason the area needs no canvas
        * and no per-pixel work at all.
        */}
      <div
        ref={area}
        className="of-picker__area"
        style={{ background: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }}
        data-testid="picker-area"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          aim(event)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) aim(event)
        }}
      >
        <span
          className="of-picker__pointer"
          aria-hidden="true"
          style={{
            left: `${String(hsv.s * 100)}%`,
            top: `${String((1 - hsv.v) * 100)}%`,
            background: hex,
          }}
        />
      </div>

      <input
        type="range"
        className="of-picker__hue"
        min={0}
        max={360}
        step={1}
        value={Math.round(hsv.h)}
        aria-label="Hue"
        data-testid="picker-hue"
        onChange={(event) => {
          commit({ ...hsv, h: Number(event.target.value) })
        }}
      />

      <div className="of-picker__row">
        <input
          type="text"
          className="of-input of-picker__hex"
          value={typed}
          maxLength={7}
          spellCheck={false}
          aria-label="Hex colour"
          data-testid="picker-hex"
          onChange={(event) => {
            /*
             * The FIELD holds what was typed; the colour only moves when what
             * was typed is a colour. Reformatting mid-entry — expanding `#f0`
             * or rejecting it — fights the person doing the typing, and this
             * is a field people paste into.
             */
            setTyped(event.target.value)
            const parsed = parseHexColor(event.target.value)
            if (parsed !== null) {
              setHsv(hexToHsv(parsed))
              onPick(parsed)
            }
          }}
        />

        {dropper !== null && (
          <button
            type="button"
            className="of-button of-button--ghost"
            data-testid="picker-eyedropper"
            onClick={() => {
              /*
               * Rejects when the user presses Escape rather than picking, which
               * is a normal outcome and not an error — an unhandled rejection
               * here is a console error every time somebody changes their mind.
               */
              void dropper.open().then(
                (result) => {
                  const parsed = parseHexColor(result.sRGBHex)
                  if (parsed === null) return
                  setHsv(hexToHsv(parsed))
                  setTyped(parsed)
                  onPick(parsed)
                },
                () => {
                  /* cancelled */
                },
              )
            }}
          >
            Pick from screen
          </button>
        )}
      </div>

      {/*
        * The contrast, stated rather than enforced.
        *
        * Not a block: somebody colouring a decorative label, or matching a
        * brand, is making a choice this panel is not entitled to overrule. It
        * is entitled to say what the choice costs.
        */}
      {ratio !== null && (
        <p
          className={`of-picker__contrast${ratio < AA_TEXT ? ' of-picker__contrast--low' : ''}`}
          data-testid="picker-contrast"
        >
          {ratio < AA_TEXT
            ? `Hard to read here — ${ratio.toFixed(1)}:1, below the 4.5:1 this product holds itself to.`
            : `Readable here — ${ratio.toFixed(1)}:1.`}
        </p>
      )}
    </div>
  )
}
