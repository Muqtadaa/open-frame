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
function seedOf(kind: SwatchKind, current: ColorValue | undefined): HexColor {
  if (typeof window === 'undefined') return '#000000'
  const css = kind === 'surface' ? surfaceOf(current, 'gray') : inkOf(current)
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
/**
 * What a swatch is a specimen OF.
 *
 * `surface` is a slip you stand on; `ink` is text; `line` is a rule. The last
 * two resolve to the same colour — a token has only two answers — and differ
 * in what they draw, because a swatch has to say which property it sets.
 */
export type SwatchKind = 'surface' | 'ink' | 'line'

/** A rule, at the weight a shape's outline is drawn at. */
function RuleMark() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" focusable="false">
      <path
        d="M4 12h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * The mark on the custom swatch: a wheel, quartered.
 *
 * Four arcs rather than a conic gradient, because the gradient would be the
 * only place in the product painting a colour that is not a token, and an icon
 * is drawn here like every other icon.
 */
function SpectrumMark() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <g fill="none" strokeWidth="3.2" strokeLinecap="butt">
        <path d="M12 4.5a7.5 7.5 0 0 1 7.5 7.5" stroke="var(--of-c-red)" />
        <path d="M19.5 12a7.5 7.5 0 0 1-7.5 7.5" stroke="var(--of-c-yellow)" />
        <path d="M12 19.5A7.5 7.5 0 0 1 4.5 12" stroke="var(--of-c-green)" />
        <path d="M4.5 12A7.5 7.5 0 0 1 12 4.5" stroke="var(--of-c-blue)" />
      </g>
    </svg>
  )
}

/**
 * What an ink swatch draws its letter ON.
 *
 * A hue sits on its own slip, which is the pair the palette tests at 4.5:1 —
 * so every swatch is legible by the same guarantee the board is.
 *
 * The two neutrals cannot: their ink and their paper are one value, so `white`
 * on `white` is an empty square, which is exactly what shipped in the first
 * version of this grid. They take the OTHER neutral, which is also the pair
 * the board will actually produce for them through `readableInkOn` — the
 * swatch shows the real outcome rather than a colour on nothing.
 */
function inkSpecimenGround(token: ColorToken): string {
  if (token === 'white') return SURFACE_VARS.black
  if (token === 'black') return SURFACE_VARS.white
  return SURFACE_VARS[token]
}

export function Swatches({
  kind,
  label,
  testPrefix,
  current,
  against,
  onPick,
}: {
  readonly kind: SwatchKind
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
          className={`of-swatch${kind === 'surface' ? '' : ' of-swatch--ink'}${
            current === token ? ' of-swatch--on' : ''
          }`}
          /*
           * An ink swatch is a SPECIMEN: the letter in that ink, on that ink's
           * own slip. Drawn on the panel instead, `white` was white on white
           * and invisible — and the paper ground is the pair the palette
           * actually tests at 4.5:1, so every swatch is legible by the same
           * guarantee the board is.
           */
          style={
            kind === 'surface'
              ? { background: SURFACE_VARS[token] }
              : { color: COLOR_VARS[token], background: inkSpecimenGround(token) }
          }
          aria-label={token}
          aria-pressed={current === token}
          title={token}
          data-testid={`${testPrefix}-${token}`}
          onClick={() => {
            setPicking(false)
            onPick(token)
          }}
        >
          {/*
            * The specimen shows what the colour will BE: a letter for text, a
            * rule for a line. Both are ink on the token's own slip — the pair
            * the palette tests — but a line offered as a row of letters is a
            * control announcing the wrong property, which is what shipped.
            */}
          {kind === 'ink' ? 'A' : null}
          {kind === 'line' ? <RuleMark /> : null}
        </button>
      ))}

      <button
        type="button"
        className={`of-swatch of-swatch--custom${custom === null ? '' : ' of-swatch--on'}`}
        // Shows the literal it currently holds, so the grid still answers "what
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
        {/*
          * A DRAWN mark, not a `+` glyph. Icons in this world are authored SVG
          * on the 24x24 grid at 1.6 — a typed plus in a dashed box read as a
          * placeholder that had failed to load, which is what it looked like.
          */}
        {custom === null ? <SpectrumMark /> : null}
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
