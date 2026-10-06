import { asObjectId, type ObjectId } from '@openframe/core'
import { createTestHarness, type TestHarness } from '@openframe/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  attachTargetAt,
  containerAt,
  hitTest,
  hitTestRaw,
  objectsInMarquee,
} from './hit-testing.js'

/**
 * What a press means when objects are INSIDE one another (rule 18): a member
 * of a group selects the group, a member of a frame selects the member, and
 * anything that reaches into a container — double-click to edit — must be
 * able to ignore membership. `canvas-geometry.test.ts` covers the flat board.
 */
let h: TestHarness

beforeEach(() => {
  h = createTestHarness()
})

function make(
  type: string,
  frame: { x: number; y: number; width: number; height: number },
  parentId?: ObjectId,
): ObjectId {
  const id = asObjectId(`obj_${type}_${String(h.store.getDocument().objects.size)}`)
  const made = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ id, type, ...frame, ...(parentId === undefined ? {} : { parentId }) }],
  })
  if (!made.ok) throw made.error
  return id
}

function group(ids: readonly ObjectId[]): ObjectId {
  const id = asObjectId('obj_group')
  const made = h.dispatcher.dispatch({ kind: 'GroupObjects', ids, id })
  if (!made.ok) throw made.error
  return id
}

const at = (x: number, y: number) => ({ x, y })

describe('a press inside a container', () => {
  it('selects the group a member belongs to, and the member of a frame', () => {
    const a = make('sticky', { x: 0, y: 0, width: 100, height: 100 })
    make('sticky', { x: 200, y: 0, width: 100, height: 100 })
    const g = group([a, asObjectId('obj_sticky_1')])
    const frame = make('frame', { x: 500, y: 0, width: 300, height: 300 })
    const inFrame = make('sticky', { x: 550, y: 50, width: 100, height: 100 }, frame)

    expect(hitTest(h.store.getDocument(), h.registry, at(50, 50))).toBe(g)
    expect(hitTest(h.store.getDocument(), h.registry, at(600, 100))).toBe(inFrame)
  })

  /*
   * A frame is picked up by its title, which the DOM finds (rule 15), never by
   * its body: a press that misses a note inside one by a few pixels used to
   * pick up the whole frame and everything in it.
   */
  it('passes a press on a frame’s empty body through to the board', () => {
    const frame = make('frame', { x: 500, y: 0, width: 300, height: 300 })
    make('sticky', { x: 550, y: 50, width: 100, height: 100 }, frame)
    expect(hitTest(h.store.getDocument(), h.registry, at(750, 250))).toBeNull()
    expect(hitTestRaw(h.store.getDocument(), h.registry, at(750, 250))).toBeNull()
    // Something underneath the frame is reached through it.
    const under = make('sticky', { x: 700, y: 200, width: 50, height: 50 })
    h.dispatcher.dispatch({ kind: 'ReorderObjects', ids: [under], placement: 'back' })
    expect(hitTest(h.store.getDocument(), h.registry, at(720, 220))).toBe(under)
  })

  it('selects what a marquee drawn inside a frame encloses, and not the frame', () => {
    const frame = make('frame', { x: 0, y: 0, width: 400, height: 400 })
    const note = make('sticky', { x: 50, y: 50, width: 100, height: 100 }, frame)
    expect(
      objectsInMarquee(h.store.getDocument(), h.registry, {
        x: 20,
        y: 20,
        width: 200,
        height: 200,
      }),
    ).toEqual([note])
  })

  it('reaches the member itself when asked raw, so grouped text stays editable', () => {
    const a = make('sticky', { x: 0, y: 0, width: 100, height: 100 })
    const b = make('sticky', { x: 200, y: 0, width: 100, height: 100 })
    group([a, b])
    expect(hitTestRaw(h.store.getDocument(), h.registry, at(250, 50))).toBe(b)
  })

  it('lists a swept group once, not the group and every member', () => {
    const a = make('sticky', { x: 0, y: 0, width: 100, height: 100 })
    const b = make('sticky', { x: 200, y: 0, width: 100, height: 100 })
    const g = group([a, b])
    expect(
      objectsInMarquee(h.store.getDocument(), h.registry, {
        x: -10,
        y: -10,
        width: 400,
        height: 200,
      }),
    ).toEqual([g])
  })
})

describe('what a line attaches to', () => {
  it('finds an object whose anchor the pointer is near, though it is outside it', () => {
    const note = make('sticky', { x: 0, y: 0, width: 100, height: 100 })
    // Just off the right edge's anchor: the anchors are drawn clear of the edge.
    expect(attachTargetAt(h.store.getDocument(), h.registry, at(112, 50), 16)).toBe(note)
  })

  it('finds nothing far from every object', () => {
    make('sticky', { x: 0, y: 0, width: 100, height: 100 })
    expect(attachTargetAt(h.store.getDocument(), h.registry, at(400, 400), 16)).toBeNull()
  })

  it('does not offer a locked object by its anchors', () => {
    const note = make('sticky', { x: 0, y: 0, width: 100, height: 100 })
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [note], locked: true })
    expect(attachTargetAt(h.store.getDocument(), h.registry, at(112, 50), 16)).toBeNull()
  })
})

describe('the container a drop lands in', () => {
  it('is the topmost frame under the point', () => {
    make('frame', { x: 0, y: 0, width: 400, height: 400 })
    const inner = make('frame', { x: 100, y: 100, width: 100, height: 100 })
    expect(containerAt(h.store.getDocument(), h.registry, at(150, 150), new Set())).toBe(inner)
  })

  it('skips what the drag excluded, and what cannot hold anything', () => {
    const outer = make('frame', { x: 0, y: 0, width: 400, height: 400 })
    const inner = make('frame', { x: 100, y: 100, width: 100, height: 100 })
    make('sticky', { x: 120, y: 120, width: 50, height: 50 })
    expect(containerAt(h.store.getDocument(), h.registry, at(150, 150), new Set([inner]))).toBe(
      outer,
    )
  })

  it('is never a locked frame', () => {
    const frame = make('frame', { x: 0, y: 0, width: 400, height: 400 })
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [frame], locked: true })
    expect(containerAt(h.store.getDocument(), h.registry, at(150, 150), new Set())).toBeNull()
  })
})
