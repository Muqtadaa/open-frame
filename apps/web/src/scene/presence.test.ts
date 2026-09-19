import { asObjectId, MAX_ZOOM, MIN_ZOOM } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import {
  canFollow,
  dragsByObject,
  editorsByObject,
  hueVar,
  initialOf,
  readPresence,
  type DragDelta,
  type Peer,
} from './presence.js'

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
        drag: { dx: 40, dy: -12 },
        viewport: { x: -200, y: 40, zoom: 1.5 },
        following: 7,
      }),
    ).toEqual({
      name: 'Otter',
      hue: 3,
      cursor: { x: 12, y: -40 },
      selection: [asObjectId('obj_a'), asObjectId('obj_b')],
      editing: asObjectId('obj_a'),
      drag: { dx: 40, dy: -12 },
      viewport: { x: -200, y: 40, zoom: 1.5 },
      following: 7,
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
    drag: null,
    viewport: null,
    following: null,
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

describe('a drag in flight', () => {
  const peer = (clientId: number, selection: string[], drag: DragDelta | null): Peer => ({
    clientId,
    name: `p${String(clientId)}`,
    hue: 0,
    cursor: null,
    selection: selection.map(asObjectId),
    editing: null,
    drag,
    viewport: null,
    following: null,
  })

  it('is absent unless it is two real numbers', () => {
    expect(readPresence({ drag: { dx: 1, dy: 2 } })?.drag).toEqual({ dx: 1, dy: 2 })
    expect(readPresence({})?.drag).toBeNull()
    expect(readPresence({ drag: null })?.drag).toBeNull()
    expect(readPresence({ drag: { dx: 1 } })?.drag).toBeNull()
    expect(readPresence({ drag: { dx: '3', dy: 2 } })?.drag).toBeNull()
    /*
     * The one that matters: a transform built from NaN is silently dropped by
     * the browser, and on some engines it takes the whole layer's rendering
     * with it — every object gone, not just the one being moved.
     */
    expect(readPresence({ drag: { dx: Number.NaN, dy: 0 } })?.drag).toBeNull()
    expect(readPresence({ drag: { dx: 0, dy: Number.POSITIVE_INFINITY } })?.drag).toBeNull()
  })

  it('moves everything in the selection of whoever is dragging', () => {
    const drags = dragsByObject([peer(1, ['obj_a', 'obj_b'], { dx: 10, dy: 5 })])

    expect(drags.get(asObjectId('obj_a'))).toEqual({ dx: 10, dy: 5 })
    expect(drags.get(asObjectId('obj_b'))).toEqual({ dx: 10, dy: 5 })
  })

  it('leaves alone the selection of somebody who is not dragging', () => {
    const drags = dragsByObject([peer(1, ['obj_a'], null)])

    expect(drags.size).toBe(0)
  })

  /**
   * Two people on one object is what the advisory lock discourages and nothing
   * prevents. Every client works this out independently from the same
   * awareness state, so they must all agree — hence lowest id, exactly as
   * `editorsByObject` breaks the same tie.
   */
  it('gives an object held by two people to the lower client id', () => {
    const drags = dragsByObject([
      peer(7, ['obj_a'], { dx: 70, dy: 0 }),
      peer(2, ['obj_a'], { dx: 20, dy: 0 }),
    ])

    expect(drags.get(asObjectId('obj_a'))).toEqual({ dx: 20, dy: 0 })
  })

  it('does not depend on the order the peers arrive in', () => {
    const low = peer(2, ['obj_a'], { dx: 20, dy: 0 })
    const high = peer(7, ['obj_a'], { dx: 70, dy: 0 })

    expect(dragsByObject([low, high])).toEqual(dragsByObject([high, low]))
  })
})

describe('following somebody around the board', () => {
  const peer = (over: Partial<Peer> = {}): Peer => ({
    clientId: 1,
    name: 'p',
    hue: 0,
    cursor: null,
    selection: [],
    editing: null,
    drag: null,
    viewport: { x: 0, y: 0, zoom: 1 },
    following: null,
    ...over,
  })

  it('reads a viewport, and refuses one that is not three real numbers', () => {
    expect(readPresence({ viewport: { x: 1, y: 2, zoom: 2 } })?.viewport).toEqual({
      x: 1,
      y: 2,
      zoom: 2,
    })
    expect(readPresence({})?.viewport).toBeNull()
    expect(readPresence({ viewport: { x: 1, y: 2 } })?.viewport).toBeNull()
    expect(readPresence({ viewport: { x: Number.NaN, y: 0, zoom: 1 } })?.viewport).toBeNull()
  })

  /**
   * Clamped rather than refused: a peer on a build with a wider zoom range is
   * still somewhere definite, and refusing them would strand their follower.
   */
  it('clamps a zoom from outside this build’s range', () => {
    expect(readPresence({ viewport: { x: 0, y: 0, zoom: 9999 } })?.viewport?.zoom).toBe(MAX_ZOOM)
    expect(readPresence({ viewport: { x: 0, y: 0, zoom: 0.00001 } })?.viewport?.zoom).toBe(MIN_ZOOM)
  })

  it('reads who they are following, and only an integer counts', () => {
    expect(readPresence({ following: 12 })?.following).toBe(12)
    expect(readPresence({})?.following).toBeNull()
    expect(readPresence({ following: '12' })?.following).toBeNull()
    expect(readPresence({ following: 1.5 })?.following).toBeNull()
  })

  it('can be followed when they are looking where they chose to', () => {
    expect(canFollow(peer())).toBe(true)
  })

  /**
   * THE LOOP GUARD. A follows B and B follows A is a viewport that feeds
   * itself: each copies the other and neither is driving. Forbidding a
   * follower as a target stops that, and stops every longer chain too,
   * because the second link can never be made.
   */
  it('cannot be followed while following somebody else', () => {
    expect(canFollow(peer({ following: 2 }))).toBe(false)
  })

  it('cannot be followed without a viewport to copy', () => {
    expect(canFollow(peer({ viewport: null }))).toBe(false)
  })
})
