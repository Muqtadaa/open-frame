import { describe, expect, it } from 'vitest'

import { cropByHandle, FULL_CROP, isCropped, uncrop } from './crop.js'

const frame = { x: 100, y: 100, width: 400, height: 300 }

describe('trimming an edge', () => {
  /*
   * THE POINT OF THE WHOLE FEATURE. If the surviving pixels move or change
   * size while you drag, cropping feels like stretching a rubber sheet rather
   * than using scissors — and the arithmetic that prevents it is one ratio.
   */
  it('leaves the pixels that survive exactly where they were', () => {
    const { frame: after, crop } = cropByHandle(frame, FULL_CROP, 'e', -100, 0)
    // A quarter off the right: the frame is a quarter narrower and shows a
    // quarter less of the picture, so what is left is the same size on screen.
    expect(after.width).toBeCloseTo(300, 6)
    expect(crop.width).toBeCloseTo(0.75, 6)
    // Scale is frame width per visible fraction, and it must not have changed.
    expect(after.width / crop.width).toBeCloseTo(frame.width / FULL_CROP.width, 6)
    // And the left edge has not moved, because the right handle was dragged.
    expect(after.x).toBe(100)
    expect(crop.x).toBe(0)
  })

  it('moves the origin when the left edge is the one trimmed', () => {
    const { frame: after, crop } = cropByHandle(frame, FULL_CROP, 'w', 100, 0)
    /*
     * An object's position IS its top-left corner, so a left-edge crop that
     * left `x` alone would slide the whole picture sideways as you dragged.
     */
    expect(after.x).toBeCloseTo(200, 6)
    expect(after.width).toBeCloseTo(300, 6)
    expect(crop.x).toBeCloseTo(0.25, 6)
    expect(crop.width).toBeCloseTo(0.75, 6)
    expect(after.width / crop.width).toBeCloseTo(frame.width / FULL_CROP.width, 6)
  })

  it('trims two edges at once from a corner', () => {
    const { frame: after, crop } = cropByHandle(frame, FULL_CROP, 'se', -100, -75)
    expect(after.width).toBeCloseTo(300, 6)
    expect(after.height).toBeCloseTo(225, 6)
    expect(crop.width).toBeCloseTo(0.75, 6)
    expect(crop.height).toBeCloseTo(0.75, 6)
  })

  it('touches only the axis its handle owns', () => {
    const { frame: after, crop } = cropByHandle(frame, FULL_CROP, 'e', -100, -75)
    expect(after.height).toBe(300)
    expect(crop.height).toBe(1)
  })

  /*
   * Cropping an already-cropped image compounds, and the ratio has to be
   * taken against what is CURRENTLY shown rather than against the whole
   * picture — otherwise the second crop overshoots.
   */
  it('compounds against what is currently shown', () => {
    const once = cropByHandle(frame, FULL_CROP, 'e', -200, 0)
    const twice = cropByHandle(once.frame, once.crop, 'e', -100, 0)
    expect(twice.crop.width).toBeCloseTo(0.25, 6)
    expect(twice.frame.width).toBeCloseTo(100, 6)
    expect(twice.frame.width / twice.crop.width).toBeCloseTo(400, 6)
  })

  it('refuses to crop away the last of the picture', () => {
    const { frame: after, crop } = cropByHandle(frame, FULL_CROP, 'e', -10_000, 0)
    expect(crop.width).toBeGreaterThan(0)
    expect(after.width).toBeGreaterThan(0)
  })

  it('ignores a drag that would grow the frame past the picture', () => {
    // Pushing the right edge outward has nothing to reveal — the window is
    // already the whole width.
    expect(cropByHandle(frame, FULL_CROP, 'e', 80, 0).frame.width).toBe(400)
  })
})

describe('putting it back', () => {
  it('restores the whole picture at the scale it is being shown at', () => {
    const cropped = cropByHandle(frame, FULL_CROP, 'se', -100, -75)
    const restored = uncrop(cropped.frame, cropped.crop)
    expect(restored.crop).toEqual(FULL_CROP)
    /*
     * The frame grows BACK. Restoring the window without growing the frame
     * would squeeze the whole picture into the cropped box, which looks like
     * the image was rescaled rather than uncropped.
     */
    expect(restored.frame.width).toBeCloseTo(frame.width, 6)
    expect(restored.frame.height).toBeCloseTo(frame.height, 6)
    expect(restored.frame.x).toBeCloseTo(frame.x, 6)
    expect(restored.frame.y).toBeCloseTo(frame.y, 6)
  })

  it('round-trips a crop taken from the left and top', () => {
    const cropped = cropByHandle(frame, FULL_CROP, 'nw', 100, 75)
    const restored = uncrop(cropped.frame, cropped.crop)
    expect(restored.frame.x).toBeCloseTo(frame.x, 6)
    expect(restored.frame.y).toBeCloseTo(frame.y, 6)
  })
})

describe('whether anything is trimmed', () => {
  it('says no for an absent or full window', () => {
    expect(isCropped(undefined)).toBe(false)
    expect(isCropped(null)).toBe(false)
    expect(isCropped(FULL_CROP)).toBe(false)
  })

  it('says yes once any edge has moved', () => {
    expect(isCropped({ x: 0, y: 0, width: 0.9, height: 1 })).toBe(true)
    expect(isCropped({ x: 0.1, y: 0, width: 1, height: 1 })).toBe(true)
  })
})
