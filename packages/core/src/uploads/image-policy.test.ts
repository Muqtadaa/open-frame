import { describe, expect, it } from 'vitest'

import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  sniffImageType,
  validateImage,
} from './image-policy.js'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45])
const box = (brand: string) =>
  new Uint8Array([0, 0, 0, 0x1c, ...new TextEncoder().encode(`ftyp${brand}`), 0, 0, 0, 0])
/** A file-type box: size, "ftyp", major brand, minor version, compatible brands. */
function ftyp(major: string, compatible: readonly string[]): Uint8Array {
  const text = new TextEncoder().encode(`ftyp${major}\0\0\0\0${compatible.join('')}`)
  const size = 4 + text.length
  return new Uint8Array([0, 0, 0, size, ...text])
}
const AVIF = box('avif')
const AVIF_SEQUENCE = box('avis')
const MP4 = box('isom')
const HEIC = box('heic')
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')

describe('sniffImageType', () => {
  it('recognises every allowed format by its bytes', () => {
    expect([PNG, JPEG, GIF, WEBP, AVIF].map(sniffImageType)).toEqual([...ALLOWED_IMAGE_TYPES])
    expect(sniffImageType(AVIF_SEQUENCE)).toBe('image/avif')
  })

  it('does not recognise SVG, which is markup rather than a raster format', () => {
    expect(sniffImageType(SVG)).toBeNull()
  })

  it('does not mistake another RIFF container for WebP', () => {
    expect(sniffImageType(WAV)).toBeNull()
  })

  /** Same box, different brand: an MP4 or a HEIC is not an AVIF. */
  it('does not mistake another ISO media file for AVIF', () => {
    expect(sniffImageType(MP4)).toBeNull()
    expect(sniffImageType(HEIC)).toBeNull()
  })

  it('returns null rather than reading past the end of a short buffer', () => {
    expect(sniffImageType(new Uint8Array([0x89, 0x50]))).toBeNull()
    expect(sniffImageType(new Uint8Array([0, 0, 0, 0x1c, 0x66, 0x74]))).toBeNull()
    expect(sniffImageType(new Uint8Array())).toBeNull()
  })

  /**
   * The spec asks for the AVIF brand somewhere in the file-type box, not as its
   * major brand: a file may lead with the generic `mif1` and list `avif` among
   * its compatible brands. Such a file is a real AVIF and must be let in.
   */
  it('recognises AVIF named among the compatible brands, not only as the major one', () => {
    expect(sniffImageType(ftyp('mif1', ['mif1', 'avif', 'miaf']))).toBe('image/avif')
    expect(sniffImageType(ftyp('msf1', ['msf1', 'avis']))).toBe('image/avif')
  })

  it('does not take a HEIC that lists only generic brands for an AVIF', () => {
    expect(sniffImageType(ftyp('mif1', ['mif1', 'heic', 'miaf']))).toBeNull()
  })

  /** A brand is only a brand inside the box: bytes after it are something else. */
  it('reads brands no further than the box says it runs', () => {
    const box = ftyp('mif1', ['mif1'])
    const trailing = new Uint8Array([...box, ...new TextEncoder().encode('avif')])
    expect(sniffImageType(trailing)).toBeNull()
  })

  it('survives a box that claims to run past the end of the file', () => {
    const box = ftyp('mif1', ['avif'])
    box[3] = 0xff
    expect(sniffImageType(box)).toBe('image/avif')
    expect(sniffImageType(box.subarray(0, 18))).toBeNull()
  })
})

describe('validateImage', () => {
  it('accepts a real PNG and a real AVIF', () => {
    expect(validateImage('image/png', PNG, PNG.length)).toEqual({ ok: true, type: 'image/png' })
    expect(validateImage('image/avif', AVIF, AVIF.length)).toEqual({ ok: true, type: 'image/avif' })
  })

  it('rejects SVG outright', () => {
    expect(validateImage('image/svg+xml', SVG, SVG.length)).toEqual({
      ok: false,
      failure: { reason: 'unsupported-type', declared: 'image/svg+xml' },
    })
  })

  /** The renamed-file attack: SVG markup declared as a PNG. */
  it('rejects content that does not match its declared type', () => {
    expect(validateImage('image/png', SVG, SVG.length)).toEqual({
      ok: false,
      failure: { reason: 'content-mismatch', declared: 'image/png', actual: null },
    })
  })

  it('rejects one raster format masquerading as another', () => {
    expect(validateImage('image/png', JPEG, JPEG.length)).toMatchObject({
      ok: false,
      failure: { reason: 'content-mismatch', actual: 'image/jpeg' },
    })
  })

  it('accepts a file exactly at the size limit and rejects one byte over', () => {
    expect(validateImage('image/png', PNG, MAX_IMAGE_BYTES).ok).toBe(true)
    expect(validateImage('image/png', PNG, MAX_IMAGE_BYTES + 1)).toMatchObject({
      ok: false,
      failure: { reason: 'too-large' },
    })
  })

  it('checks size first, so an enormous file is rejected without reading it', () => {
    expect(validateImage('application/pdf', new Uint8Array(), MAX_IMAGE_BYTES + 1)).toMatchObject({
      ok: false,
      failure: { reason: 'too-large' },
    })
  })
})
