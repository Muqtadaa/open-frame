import { describe, expect, it } from 'vitest'

import { countOfType, selectionMakeup, typeNoun, typeTitle } from './type-noun.js'

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

describe('countOfType', () => {
  it('counts the way a person does', () => {
    expect(countOfType('frame', 1)).toBe('1 frame')
    expect(countOfType('frame', 2)).toBe('2 frames')
    expect(countOfType('sticky', 1)).toBe('1 sticky note')
    expect(countOfType('sticky', 3)).toBe('3 sticky notes')
    expect(countOfType('evidence', 4)).toBe('4 evidence')
    expect(countOfType('journey-stage', 2)).toBe('2 journey stages')
    expect(countOfType('box', 2)).toBe('2 boxes')
    expect(countOfType('story', 2)).toBe('2 stories')
  })
})
