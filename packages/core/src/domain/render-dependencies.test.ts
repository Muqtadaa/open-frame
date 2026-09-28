import { describe, expect, it } from 'vitest'

import { createTestHarness } from '../testing.js'
import { asObjectId, type ObjectId } from './ids.js'

/**
 * What a drawn object has to hear about to stay drawn correctly (tracks A-6).
 *
 * A connector declares the objects at its ends. When an end is a GROUP, that
 * is not enough: a group's bounds are its children's, and its own object never
 * changes when a child moves — so the line kept pointing at where the group
 * used to be. The group's descendants are part of what the line depends on.
 */

const id = (name: string): ObjectId => asObjectId(`obj_${name}`)

function board() {
  const h = createTestHarness()
  const made = h.dispatcher.transact('Make', [
    {
      kind: 'CreateObjects',
      objects: [
        { id: id('a'), type: 'sticky', x: 0, y: 0 },
        { id: id('b'), type: 'sticky', x: 300, y: 0 },
        { id: id('f'), type: 'frame', x: 600, y: 0, width: 300, height: 300 },
        { id: id('in-frame'), type: 'sticky', x: 620, y: 20, parentId: id('f') },
        { id: id('g'), type: 'group', x: 0, y: 0 },
      ],
    },
    { kind: 'ReparentObjects', ids: [id('a'), id('b')], parentId: id('g') },
  ])
  if (!made.ok) throw made.error
  return h
}

function connector(h: ReturnType<typeof board>, from: ObjectId, to: ObjectId) {
  const made = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [
      {
        id: id('line'),
        type: 'connector',
        x: 0,
        y: 0,
        data: {
          from: { kind: 'object', objectId: from, anchor: { kind: 'auto' } },
          to: { kind: 'object', objectId: to, anchor: { kind: 'auto' } },
          routing: 'straight',
          points: [],
          startArrow: 'none',
          endArrow: 'arrow',
          text: [{ text: '' }],
          label: null,
        },
      },
    ],
  })
  if (!made.ok) throw made.error
  const line = h.store.getObject(id('line'))
  if (line === undefined) throw new Error('no line')
  return line
}

describe('what a connector depends on to be drawn', () => {
  it('includes a group end’s members, whose bounds are the group’s', () => {
    const h = board()
    const line = connector(h, id('g'), id('f'))
    const depends = h.registry.renderDependenciesOf(line, h.store.getDocument())
    expect([...depends].sort()).toEqual([id('a'), id('b'), id('f'), id('g')].sort())
  })

  it('does not include a frame end’s contents, whose bounds are the frame’s own', () => {
    const h = board()
    const line = connector(h, id('f'), id('g'))
    expect(h.registry.renderDependenciesOf(line, h.store.getDocument())).not.toContain(
      id('in-frame'),
    )
  })

  it('is what the type declares when no end is a group', () => {
    const h = board()
    const line = connector(h, id('f'), id('in-frame'))
    expect([...h.registry.renderDependenciesOf(line, h.store.getDocument())].sort()).toEqual(
      [id('f'), id('in-frame')].sort(),
    )
  })
})

describe('whether a line hears members join its ends', () => {
  it('does for a group end, even an empty one', () => {
    const h = createTestHarness()
    const made = h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [
        { id: id('g'), type: 'group', x: 0, y: 0 },
        { id: id('b'), type: 'sticky', x: 300, y: 0 },
      ],
    })
    if (!made.ok) throw made.error
    const line = connector(h, id('g'), id('b'))
    expect(h.registry.dependsOnMembers(line, h.store.getDocument())).toBe(true)
  })

  it('does not for frame ends, whose bounds are their own', () => {
    const h = board()
    const line = connector(h, id('f'), id('in-frame'))
    expect(h.registry.dependsOnMembers(line, h.store.getDocument())).toBe(false)
  })
})
