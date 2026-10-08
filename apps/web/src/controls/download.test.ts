import { describe, expect, it } from 'vitest'

import { fileNameFor } from './download.js'

describe('a file name', () => {
  it('is the title’s words, lower case and hyphenated', () => {
    expect(fileNameFor(['Q3 Research: Pricing!'], 'md')).toBe('q3-research-pricing.md')
  })

  it('joins the parts it is given', () => {
    expect(fileNameFor(['Q3 Research', 'Interviews'], 'md')).toBe('q3-research-interviews.md')
  })

  it('is "board" when no part has words a file name can hold', () => {
    expect(fileNameFor([null, '✨'], 'openframe.json')).toBe('board.openframe.json')
  })
})
