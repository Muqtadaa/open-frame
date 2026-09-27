import { describe, expect, it } from 'vitest'

import { LABEL_SCALE_MAX, LABEL_SCALE_MIN, labelScale } from './label-scale.js'

describe('labelScale', () => {
  const onScreen = (zoom: number): number => labelScale(zoom) * zoom

  it('follows the board between its limits', () => {
    expect(onScreen(1)).toBeCloseTo(1)
    expect(onScreen(0.75)).toBeCloseTo(0.75)
    expect(onScreen(1.5)).toBeCloseTo(1.5)
  })

  it('stops at its limits either side', () => {
    expect(onScreen(0.05)).toBeCloseTo(LABEL_SCALE_MIN)
    expect(onScreen(16)).toBeCloseTo(LABEL_SCALE_MAX)
  })
})
