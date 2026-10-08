import { describe, expect, it } from 'vitest'

import { counted } from './counted.js'

describe('counted', () => {
  it('says one in the singular and the rest in the plural', () => {
    expect(counted(1, 'note')).toBe('1 note')
    expect(counted(0, 'note')).toBe('0 notes')
    expect(counted(3, 'note')).toBe('3 notes')
  })

  it('takes an irregular plural', () => {
    expect(counted(2, 'person', 'people')).toBe('2 people')
  })
})
