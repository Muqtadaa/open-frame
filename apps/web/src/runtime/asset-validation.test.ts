import { describe, expect, it } from 'vitest'

import {
  MAX_IMAGE_BYTES,
  describeFailure,
  sniffImageType,
  validateImage,
} from './asset-validation.js'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45])
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')

describe('sniffImageType', () => {
  it.each([
    ['png', PNG, 'image/png'],
    ['jpeg', JPEG, 'image/jpeg'],
    ['gif', GIF, 'image/gif'],
    ['webp', WEBP, 'image/webp'],
  ])('recognises %s', (_name, bytes, expected) => {
    expect(sniffImageType(bytes)).toBe(expected)
  })

  it('does not recognise SVG, which is markup rather than a raster format', () => {
    expect(sniffImageType(SVG)).toBeNull()
  })

  it('does not mistake another RIFF container for WebP', () => {
    expect(sniffImageType(WAV)).toBeNull()
  })

  it('returns null rather than reading past the end of a short buffer', () => {
    expect(sniffImageType(new Uint8Array())).toBeNull()
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeNull()
    expect(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull()
  })
})

describe('validateImage', () => {
  it('accepts a real PNG', () => {
    expect(validateImage('image/png', PNG, PNG.length)).toEqual({ ok: true, type: 'image/png' })
  })

  it('rejects SVG outright', () => {
    const result = validateImage('image/svg+xml', SVG, SVG.length)
    expect(result).toEqual({
      ok: false,
      failure: { reason: 'unsupported-type', declared: 'image/svg+xml' },
    })
  })

  /**
   * The case sniffing exists for. A declared type comes from the filename, so
   * renaming an SVG to `.png` must not get it past the allowlist.
   */
  it('rejects content that does not match its declared type', () => {
    const result = validateImage('image/png', SVG, SVG.length)
    expect(result).toEqual({
      ok: false,
      failure: { reason: 'content-mismatch', declared: 'image/png', actual: null },
    })
  })

  it('rejects one raster format masquerading as another', () => {
    const result = validateImage('image/png', JPEG, JPEG.length)
    expect(result).toEqual({
      ok: false,
      failure: { reason: 'content-mismatch', declared: 'image/png', actual: 'image/jpeg' },
    })
  })

  it('rejects a file over the size limit', () => {
    const result = validateImage('image/png', PNG, MAX_IMAGE_BYTES + 1)
    expect(result.ok).toBe(false)
  })

  it('checks size first, so an enormous file is rejected without reading it', () => {
    const result = validateImage('application/pdf', new Uint8Array(), MAX_IMAGE_BYTES + 1)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.failure.reason).toBe('too-large')
  })
})

describe('describeFailure', () => {
  it('names SVG specifically, since dragging one in is a reasonable thing to try', () => {
    expect(describeFailure({ reason: 'unsupported-type', declared: 'image/svg+xml' })).toContain(
      'SVG',
    )
  })

  it('reports size in MB rather than bytes', () => {
    expect(describeFailure({ reason: 'too-large', byteSize: 31_457_280 })).toContain('30.0MB')
  })
})
