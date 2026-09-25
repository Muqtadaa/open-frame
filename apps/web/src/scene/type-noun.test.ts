import { describe, expect, it } from 'vitest'

import { selectionMakeup, typeNoun, typeTitle } from './type-noun.js'

describe('what a person calls a type', () => {
  it('reads an id as words', () => {
    expect(typeNoun('journey-stage')).toBe('journey stage')
    expect(typeNoun('evidence')).toBe('evidence')
  })

  it('raises the first letter for a heading, and only that', () => {
    expect(typeTitle('journey-stage')).toBe('Journey stage')
    expect(typeTitle('sticky')).toBe('Sticky')
  })

  it('says what a mixed selection is made of, in the order it was met', () => {
    expect(selectionMakeup(['sticky', 'shape'])).toBe('sticky · shape')
    expect(selectionMakeup(['sticky', 'shape', 'sticky', 'sticky'])).toBe('sticky ×3 · shape')
  })
})
