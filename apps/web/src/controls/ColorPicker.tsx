import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { parseHexColor, type ColorValue, type HexColor } from '@openframe/core'

import { contrastRatio, hexToHsv, hsvToHex, type Hsv } from '../scene/color.js'
import { DropperIcon } from './icons.js'

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
  /** The colour settled on: called ONCE per gesture, when it ends. */
  readonly onPick: (color: ColorValue) => void
  /**
   * The colour being aimed at, or `null` to take the preview away (Escape).
   *
   * Aiming is a gesture, and a gesture writes nothing until it ends (rules 4
   * and 14): the picker used to call `onPick` on every pointer move, and one
   * drag across the area left about twenty undo entries. A caller that cannot
   * preview leaves this out and simply sees the colour land when the gesture
   * does.
   */
  readonly onPreview?: (color: ColorValue | null) => void
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
export function ColorPicker({ current, against, onPick, onPreview, onClose }: ColorPickerProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(current))
  const [typed, setTyped] = useState<string>(current)
  const area = useRef<HTMLDivElement>(null)
  const dropper = useMemo(() => eyeDropper(), [])
  /*
   * What has been aimed at and not yet settled. A ref, because it is read by
   * handlers and by the unmount below, none of which should re-render.
   */
  const pending = useRef<HexColor | null>(null)
  // The latest callbacks, so the unmount flush below sees today's selection.
  const settle = useRef(onPick)
  useEffect(() => {
    settle.current = onPick
  }, [onPick])

  const aimAt = (value: HexColor): void => {
    pending.current = value
    onPreview?.(value)
  }

  /** The gesture has ended: write what it aimed at, once. */
  const flush = (): void => {
    const value = pending.current
    if (value === null) return
    pending.current = null
    onPick(value)
  }

  /*
   * Closing by any route but Escape keeps the colour — clicking away is how
   * somebody says "that one" — so a pending preview is settled on the way out.
   */
  useEffect(
    () => () => {
      const value = pending.current
      if (value !== null) settle.current(value)
    },
    [],
  )

  const hex = hsvToHex(hsv)
  const ratio = against === null ? null : contrastRatio(hex, against)

  // Escape closes without applying anything further, the convention every
  // other transient surface in this app follows.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        // Escape is the one way out that takes the preview back.
        event.stopPropagation()
        pending.current = null
        onPreview?.(null)
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose, onPreview])

  const aim = (next: Hsv): void => {
    setHsv(next)
    const value = hsvToHex(next)
    setTyped(value)
    aimAt(value)
  }

  const aimArea = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const box = area.current?.getBoundingClientRect()
    if (box === undefined) return
    const s = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width))
    const v = 1 - Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))
    aim({ ...hsv, s, v })
  }

  return (
    <div className="of-picker of-surface" data-testid="color-picker" role="group" aria-label="Custom colour">
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
          aimArea(event)
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) aimArea(event)
        }}
        onLostPointerCapture={flush}
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
          aim({ ...hsv, h: Number(event.target.value) })
        }}
        // Released, or left with the keyboard: either way the hue is chosen.
        onPointerUp={flush}
        onBlur={flush}
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
              aimAt(parsed)
            }
          }}
          // `#f00` is a colour on the way to `#f00a0b`: settle on Enter or on leaving.
          onKeyDown={(event) => {
            if (event.key === 'Enter') flush()
          }}
          onBlur={flush}
        />

        {dropper !== null && (
          <button
            type="button"
            className="of-picker__dropper"
            // The label lives here rather than in the button: as text it wrapped
            // onto three lines beside the field and dominated the panel.
            data-tip="Pick a colour from the screen"
            aria-description="Pick a colour from the screen"
            aria-label="Pick a colour from the screen"
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
            <DropperIcon />
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
