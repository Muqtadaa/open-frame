import { COLOR_TOKENS, isHexColor, type ColorToken, type ColorValue, type HexColor } from '@openframe/core'
import { useState } from 'react'

import { resolveCssColor } from '../scene/color.js'
import { COLOR_VARS, SURFACE_VARS, inkOf, surfaceOf } from '../scene/style-tokens.js'
import { ColorPicker } from './ColorPicker.js'

/**
 * Presentational controls, shared by the record panel and by object views.
 *
 * It lives here rather than in `ui/` because `views/` is a LEAF and may not
 * reach into the interface layer — and a table's cell colours have to offer
 * the same control the panel does, or the product has two colour pickers that
 * drift. A control in this folder may read core and `scene/`, and nothing else.
 */

/**
 * Where the wheel opens when nothing literal is set yet: the colour the object
 * is already showing, resolved through the theme.
 *
 * A picker that opens on a colour the object has never had makes every small
 * adjustment start with finding your way back — and `#000000` is the honest
 * answer only when the document has not loaded, which is when nothing is
 * selected anyway.
 */
function seedOf(kind: 'surface' | 'ink', current: ColorValue | undefined): HexColor {
  if (typeof window === 'undefined') return '#000000'
  const css = kind === 'ink' ? inkOf(current) : surfaceOf(current, 'gray')
  return resolveCssColor(css, window.document.documentElement) ?? '#000000'
}

/**
 * The ground a colour will be read against, as a hex, or `null` when there is
 * no single answer.
 *
 * Resolved through the live document so it follows the theme: a token is a
 * variable until the cascade has been asked. `null` — a mixed selection, or a
 * range of cells that disagree — is why the picker's contrast line is optional
 * rather than always shown. A number measured against a surface only some of
 * the selection has is worse than no number.
 */
export function groundOf(surface: ColorValue | undefined): HexColor | null {
  if (typeof window === 'undefined') return null
  const root = window.document.documentElement
  return resolveCssColor(surface === undefined ? 'var(--of-bg)' : surfaceOf(surface, 'gray'), root)
}

/**
 * A row of the palette, plus the way out of it.
 *
 * One component wherever a colour is chosen: the record panel's two rows and a
 * table's cell colours all come through here, so there is one place to fix
 * anything any of them gets wrong. They differ only in what a token MEANS — a
 * wash to stand on, or an ink to write with.
 *
 * The custom swatch is last and looks different on purpose. The palette is
 * what the product recommends and what it can prove; a literal is available,
 * not equal.
 */
export function Swatches({
  kind,
  label,
  testPrefix,
  current,
  against,
  onPick,
}: {
  readonly kind: 'surface' | 'ink'
  readonly label: string
  readonly testPrefix: string
  readonly current: ColorValue | undefined
  readonly against: HexColor | null
  readonly onPick: (color: ColorValue) => void
}) {
  const [picking, setPicking] = useState(false)
  const custom = isHexColor(current) ? current : null

  return (
    <div className="of-swatches" role="group" aria-label={label}>
      {COLOR_TOKENS.map((token: ColorToken) => (
        <button
          key={token}
          type="button"
          className={`of-swatch${kind === 'ink' ? ' of-swatch--ink' : ''}${
            current === token ? ' of-swatch--on' : ''
          }`}
          style={kind === 'ink' ? { color: COLOR_VARS[token] } : { background: SURFACE_VARS[token] }}
          aria-label={token}
          aria-pressed={current === token}
          title={token}
          data-testid={`${testPrefix}-${token}`}
          onClick={() => {
            setPicking(false)
            onPick(token)
          }}
        >
          {kind === 'ink' ? 'A' : null}
        </button>
      ))}

      <button
        type="button"
        className={`of-swatch of-swatch--custom${custom === null ? '' : ' of-swatch--on'}`}
        // Shows the literal it currently holds, so the row still answers "what
        // is this set to" when the answer is not in the palette.
        style={custom === null ? undefined : { background: custom }}
        aria-label="Custom colour"
        aria-expanded={picking}
        title="Custom colour"
        data-testid={`${testPrefix}-custom`}
        onClick={() => {
          setPicking((open) => !open)
        }}
      >
        {custom === null ? '+' : null}
      </button>

      {picking && (
        <ColorPicker
          current={custom ?? seedOf(kind, current)}
          against={against}
          onPick={onPick}
          onClose={() => {
            setPicking(false)
          }}
        />
      )}
    </div>
  )
}
