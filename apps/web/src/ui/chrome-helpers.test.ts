import { asBoardId, type FieldDefinition } from '@openframe/core'
import { afterEach, describe, expect, it } from 'vitest'

import { cameFrom, handBackFocus } from './hand-back-focus.js'
import { fromText, toText } from './record-text.js'
import { handOver, takeHandedOver } from './share-handover.js'
import { refusalOf } from './ZoomControl.js'

/**
 * The decisions inside the chrome that need no rendering to check: what the
 * zoom field refuses, how a tags line round-trips, where links go when sharing
 * moves a board, and where the keyboard lands when a control disappears.
 */

describe('what the zoom field refuses', () => {
  it('accepts a percentage with or without its sign', () => {
    expect(refusalOf('150')).toBeNull()
    expect(refusalOf(' 75% ')).toBeNull()
  })

  it('says what it wants for something that is not a number', () => {
    expect(refusalOf('big')).toBe('Type a number, like 150')
  })

  it('names the range rather than quietly clamping to it', () => {
    expect(refusalOf('2')).toBe('Zoom is 5–1600%')
    expect(refusalOf('5000')).toBe('Zoom is 5–1600%')
    expect(refusalOf('5')).toBeNull()
    expect(refusalOf('1600')).toBeNull()
  })
})

describe('a record field as one line of text', () => {
  const field = (kind: FieldDefinition['kind']): FieldDefinition => ({
    key: 'k',
    label: 'K',
    kind,
    meaning: 'record',
  })

  it('writes tags as a comma list, and reads them back trimmed with empties dropped', () => {
    expect(toText(field('tags'), ['alpha', 'beta'])).toBe('alpha, beta')
    expect(fromText(field('tags'), ' alpha ,, beta ,')).toEqual(['alpha', 'beta'])
  })

  it('round-trips what it wrote', () => {
    const tags = ['one', 'two words', 'three']
    expect(fromText(field('tags'), toText(field('tags'), tags))).toEqual(tags)
  })

  it('leaves other text exactly as typed, spaces and commas included', () => {
    expect(fromText(field('text'), ' a, b ')).toBe(' a, b ')
  })

  it('shows nothing for a stored value of the wrong shape', () => {
    expect(toText(field('tags'), 'not a list')).toBe('')
    expect(toText(field('text'), 42)).toBe('')
  })
})

describe('links handed over when sharing moves a board', () => {
  afterEach(() => {
    sessionStorage.clear()
  })

  const board = asBoardId('board_new')
  const links = { boardId: board, editLink: 'https://e', viewLink: 'https://v' }

  it('are taken by the board they belong to, once', () => {
    handOver(links)
    expect(takeHandedOver(board)).toEqual(links)
    // A reload of the same board must not open the sheet a second time.
    expect(takeHandedOver(board)).toBeNull()
  })

  it('are left alone by any other board', () => {
    handOver(links)
    expect(takeHandedOver(asBoardId('board_other'))).toBeNull()
    expect(takeHandedOver(board)).toEqual(links)
  })

  it('are refused when what was left is not a pair of links', () => {
    sessionStorage.setItem('openframe:shared-links', JSON.stringify({ boardId: board }))
    expect(takeHandedOver(board)).toBeNull()
    sessionStorage.setItem('openframe:shared-links', '{not json')
    expect(takeHandedOver(board)).toBeNull()
  })
})

describe('where the keyboard goes when a control disappears', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  function button(testId?: string): HTMLButtonElement {
    const element = document.createElement('button')
    if (testId !== undefined) element.dataset.testid = testId
    document.body.append(element)
    return element
  }

  it('goes back where it came from, while that is still on the page', () => {
    const origin = button()
    button('tool-select')
    handBackFocus(origin)
    expect(document.activeElement).toBe(origin)
  })

  it('falls to the rail’s first tool when where it came from has gone', () => {
    const origin = button()
    const select = button('tool-select')
    origin.remove()
    handBackFocus(origin)
    expect(document.activeElement).toBe(select)
  })

  it('remembers only focus that came from OUTSIDE the surface', () => {
    const surface = document.createElement('div')
    const inside = document.createElement('button')
    surface.append(inside)
    const outside = button()
    document.body.append(surface)

    const arriving = (relatedTarget: Element) =>
      ({ relatedTarget, currentTarget: surface }) as unknown as FocusEvent
    expect(cameFrom(arriving(outside))).toBe(outside)
    expect(cameFrom(arriving(inside))).toBeNull()
  })
})
