import { parseHexColor, type HexColor } from '@openframe/core'

/**
 * Colour arithmetic for the picker.
 *
 * Pure and here rather than in the component, because a wheel is geometry and
 * a contrast ratio is a number — neither needs React, and both are worth
 * testing without one.
 */

export interface Hsv {
  /** 0..360 */
  readonly h: number
  /** 0..1 */
  readonly s: number
  /** 0..1 */
  readonly v: number
}

function byte(n: number): string {
  return Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0')
}

export function hsvToHex({ h, s, v }: Hsv): HexColor {
  /*
   * Normalised ONCE, at the top.
   *
   * The sector used to be normalised and the ramp within it was not, so a
   * negative hue landed in the right sixth of the circle with the wrong ramp
   * across it: -60 came out red instead of magenta. A dragged hue slider only
   * produces 0..360, which is exactly why this would have survived — the wrap
   * is what a keyboard step off either end reaches.
   */
  const hue = ((h % 360) + 360) % 360
  const c = v * s
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = v - c
  const sector = Math.floor(hue / 60)
  const [r, g, b] = (
    [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x],
    ] as const
  )[sector] ?? [0, 0, 0]
  return `#${byte((r + m) * 255)}${byte((g + m) * 255)}${byte((b + m) * 255)}` as HexColor
}

export function hexToHsv(hex: string): Hsv {
  const parsed = parseHexColor(hex)
  if (parsed === null) return { h: 0, s: 0, v: 0 }
  const [r, g, b] = channels(parsed).map((c) => c / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const span = max - min

  /*
   * Hue is undefined for a grey, not zero — there is no angle on a circle of
   * radius nothing. Reporting 0 (red) would make the picker's pointer jump to
   * the red edge the moment somebody dragged saturation to nothing, losing the
   * hue they had been working in.
   */
  const h =
    span === 0
      ? 0
      : max === r
        ? 60 * (((g - b) / span + 6) % 6)
        : max === g
          ? 60 * ((b - r) / span + 2)
          : 60 * ((r - g) / span + 4)

  return { h, s: max === 0 ? 0 : span / max, v: max }
}

export function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * The WCAG 2.2 contrast ratio between two colours, 1 to 21.
 *
 * The same formula `design-tokens.test.ts` asserts the palette with. A token
 * pair is proven at build time; a colour somebody picks cannot be, so this is
 * the same question asked live in the picker instead. Duplicated deliberately:
 * the test parses the stylesheet from disk under Node and must not import the
 * app to do it.
 */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * A CSS colour as six hex digits, resolving `var(--of-…)` against the live
 * document.
 *
 * The picker compares an ink against the ground it will sit on, and that
 * ground is usually a token — which is a variable, not a colour, until the
 * cascade has been consulted. `null` when the value is not something this can
 * reduce to a hex, which is the honest answer: a gradient or an image has no
 * one colour to measure against.
 */
export function resolveCssColor(value: string, root: HTMLElement): HexColor | null {
  const direct = parseHexColor(value)
  if (direct !== null) return direct

  const name = /^var\((--[\w-]+)\)$/.exec(value.trim())?.[1]
  if (name === undefined) return null
  return parseHexColor(getComputedStyle(root).getPropertyValue(name))
}
