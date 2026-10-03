import * as shared from '@openframe/core/uploads'
import { describe, expect, it } from 'vitest'

import * as runtime from './asset-validation.js'
import { describeFailure } from './asset-validation.js'

/**
 * The checks themselves are tested where they live, in
 * `packages/core/src/uploads`. What is pinned here is that the browser uses
 * THAT policy rather than a copy of it — a copy is how the browser and the
 * room came to disagree about size, AVIF and sniffing in the first place.
 */
describe('the policy the browser applies', () => {
  it('is the shared one, not a copy', () => {
    expect(runtime.ALLOWED_IMAGE_TYPES).toBe(shared.ALLOWED_IMAGE_TYPES)
    expect(runtime.MAX_IMAGE_BYTES).toBe(shared.MAX_IMAGE_BYTES)
    expect(runtime.validateImage).toBe(shared.validateImage)
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
    expect(describeFailure({ reason: 'too-large', byteSize: 31_457_280 })).toContain('12MB')
  })
})
