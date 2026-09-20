import { describe, expect, it } from 'vitest'

import { contrastRatio, hexToHsv, hsvToHex } from './color.js'

describe('hsv and hex', () => {
  /**
   * Round-tripping through every sector, because the conversion is a table
   * lookup indexed by hue and an off-by-one in it swaps two whole families of
   * colour — the kind of thing that looks like "the wheel is rotated" rather
   * than like a bug.
   */
  it.each([
    '#ff0000',
    '#ffff00',
    '#00ff00',
    '#00ffff',
    '#0000ff',
    '#ff00ff',
    '#3a7bd5',
    '#7a5c00',
    '#000000',
    '#ffffff',
    '#808080',
  ])('round-trips %s', (hex) => {
    expect(hsvToHex(hexToHsv(hex))).toBe(hex)
  })

  it('reads the six primaries onto the right sector', () => {
    expect(Math.round(hexToHsv('#ff0000').h)).toBe(0)
    expect(Math.round(hexToHsv('#ffff00').h)).toBe(60)
    expect(Math.round(hexToHsv('#00ff00').h)).toBe(120)
    expect(Math.round(hexToHsv('#00ffff').h)).toBe(180)
    expect(Math.round(hexToHsv('#0000ff').h)).toBe(240)
    expect(Math.round(hexToHsv('#ff00ff').h)).toBe(300)
  })

  /** A grey has no hue, and saying it is red would move the picker's pointer. */
  it('reports no saturation for a grey, at any lightness', () => {
    expect(hexToHsv('#808080').s).toBe(0)
    expect(hexToHsv('#000000').s).toBe(0)
    expect(hexToHsv('#ffffff').s).toBe(0)
  })

  it('wraps a hue past the circle rather than falling off the table', () => {
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe('#ff0000')
    expect(hsvToHex({ h: 720, s: 1, v: 1 })).toBe('#ff0000')
    expect(hsvToHex({ h: -60, s: 1, v: 1 })).toBe('#ff00ff')
  })
})

describe('contrast', () => {
  it('puts black on white at the maximum and a colour on itself at the minimum', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#3a7bd5', '#3a7bd5')).toBeCloseTo(1, 5)
  })

  /** Order must not matter: the ratio is between two colours, not from one. */
  it('is symmetric', () => {
    expect(contrastRatio('#7a5c00', '#ffe9a3')).toBeCloseTo(
      contrastRatio('#ffe9a3', '#7a5c00'),
      10,
    )
  })

  /**
   * The pair the palette ships, at the value `design-tokens.test.ts` measures
   * it at. If these two ever disagree, one of them is wrong about WCAG.
   */
  it('agrees with the palette suite on a real pair', () => {
    expect(contrastRatio('#7a5c00', '#ffe9a3')).toBeGreaterThan(5.1)
    expect(contrastRatio('#7a5c00', '#ffe9a3')).toBeLessThan(5.3)
  })
})
