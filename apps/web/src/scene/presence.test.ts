import { asObjectId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { editorsByObject, hueVar, initialOf, readPresence, type Peer } from './presence.js'

/**
 * Presence arrives from somebody else's browser, so these are boundary tests
 * rather than shape tests: every one of them is a thing a peer could send.
 */
describe('reading a peer state', () => {
  it('takes a well-formed one as it is', () => {
    expect(
      readPresence({
        name: 'Otter',
        hue: 3,
        cursor: { x: 12, y: -40 },
        selection: ['obj_a', 'obj_b'],
        editing: 'obj_a',
      }),
    ).toEqual({
      name: 'Otter',
      hue: 3,
      cursor: { x: 12, y: -40 },
      selection: [asObjectId('obj_a'), asObjectId('obj_b')],
      editing: asObjectId('obj_a'),
    })
  })

  it.each([[null], [undefined], ['a string'], [42]])('refuses %s outright', (raw) => {
    expect(readPresence(raw)).toBeNull()
  })

  /**
   * A non-finite coordinate produces a transform the browser silently drops,
   * and on some engines it takes the whole layer's rendering with it.
   */
  it.each([
    ['NaN', { x: Number.NaN, y: 0 }],
    ['Infinity', { x: 0, y: Number.POSITIVE_INFINITY }],
    ['strings', { x: '10', y: '10' }],
    ['a missing axis', { x: 10 }],
  ])('drops a cursor at %s', (_label, cursor) => {
    expect(readPresence({ cursor })?.cursor).toBeNull()
  })

  it('clamps a hue that is not in the palette', () => {
    expect(readPresence({ hue: 99 })?.hue).toBe(0)
    expect(readPresence({ hue: -1 })?.hue).toBe(0)
    expect(readPresence({ hue: 1.5 })?.hue).toBe(0)
  })

  /** Otherwise one peer can have this client drawing outlines until it stops. */
  it('caps how many objects a peer may claim to have selected', () => {
    const many = Array.from({ length: 5_000 }, (_, i) => `obj_${String(i)}`)
    expect(readPresence({ selection: many })?.selection).toHaveLength(200)
  })

  it('ignores junk inside a selection', () => {
    expect(readPresence({ selection: ['obj_a', 42, null, '', 'obj_b'] })?.selection).toEqual([
      asObjectId('obj_a'),
      asObjectId('obj_b'),
    ])
  })

  it('gives an unnamed peer a name rather than an empty label', () => {
    expect(readPresence({})?.name).toBe('Guest')
    expect(readPresence({ name: '   ' })?.name).toBe('Guest')
  })

  it('truncates a name long enough to cover the board', () => {
    expect(readPresence({ name: 'x'.repeat(500) })?.name).toHaveLength(24)
  })
})

describe('who is editing what', () => {
  const peer = (clientId: number, editing: string | null): Peer => ({
    clientId,
    name: `p${String(clientId)}`,
    hue: 0,
    cursor: null,
    selection: [],
    editing: editing === null ? null : asObjectId(editing),
  })

  /**
   * Two people can start editing the same object in the same instant, and every
   * client has to reach the SAME answer about who won — they each work it out
   * from their own copy of awareness, with nobody arbitrating.
   */
  it('gives a contested object to the lowest client id, whatever the order', () => {
    const forwards = editorsByObject([peer(9, 'obj_a'), peer(2, 'obj_a')])
    const backwards = editorsByObject([peer(2, 'obj_a'), peer(9, 'obj_a')])

    expect(forwards.get(asObjectId('obj_a'))?.clientId).toBe(2)
    expect(backwards.get(asObjectId('obj_a'))?.clientId).toBe(2)
  })

  it('ignores peers who are not editing anything', () => {
    expect(editorsByObject([peer(1, null), peer(2, null)]).size).toBe(0)
  })
})

describe('presenting a peer', () => {
  it('reads a colour from the palette, never a value', () => {
    expect(hueVar(0)).toBe('var(--of-p-1)')
    expect(hueVar(5)).toBe('var(--of-p-6)')
    expect(hueVar(6)).toBe('var(--of-p-1)')
  })

  it('takes one character for a chip', () => {
    expect(initialOf('Otter')).toBe('O')
    expect(initialOf('  badger')).toBe('B')
    expect(initialOf('')).toBe('?')
  })
})
