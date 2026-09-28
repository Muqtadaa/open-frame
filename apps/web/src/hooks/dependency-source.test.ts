import { asObjectId } from '@openframe/core'
import { createTestHarness } from '@openframe/core/testing'
import { describe, expect, it } from 'vitest'

import { dependencySource } from './use-document-object.js'

/**
 * A line's render signal, driven the way `useSyncExternalStore` drives it.
 *
 * React reads the snapshot while rendering and subscribes afterwards, in an
 * effect, then reads it again to see whether anything changed in between. A
 * snapshot that could only move when a subscription fired could not: a line
 * whose end moved in that gap stayed drawn where the end had been (Codex, on
 * #18).
 */
const a = asObjectId('obj_a')
const b = asObjectId('obj_b')
const line = asObjectId('obj_line')

function board() {
  const h = createTestHarness()
  const end = (objectId: typeof a) => ({ kind: 'object', objectId, anchor: { kind: 'auto' } })
  const made = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [
      { id: a, type: 'sticky', x: 0, y: 0 },
      { id: b, type: 'sticky', x: 400, y: 0 },
      {
        id: line,
        type: 'connector',
        x: 0,
        y: 0,
        data: {
          from: end(a),
          to: end(b),
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
  return h
}

const move = (h: ReturnType<typeof board>) => {
  const moved = h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: b, dx: 0, dy: 200 }] })
  if (!moved.ok) throw moved.error
}

describe('the render signal of a line', () => {
  it('moves when an end changed between the render and the subscription', () => {
    const h = board()
    const source = dependencySource(h.store, h.registry, line)
    const rendered = source.getSnapshot()
    move(h)
    const unsubscribe = source.subscribe(() => undefined)
    expect(source.getSnapshot()).not.toBe(rendered)
    unsubscribe()
  })

  it('moves once per change to an end while subscribed', () => {
    const h = board()
    const source = dependencySource(h.store, h.registry, line)
    let heard = 0
    const unsubscribe = source.subscribe(() => {
      heard += 1
    })
    const before = source.getSnapshot()
    move(h)
    expect(heard).toBe(1)
    expect(source.getSnapshot()).not.toBe(before)
    unsubscribe()
  })

  it('stays put when nothing changed', () => {
    const h = board()
    const source = dependencySource(h.store, h.registry, line)
    const rendered = source.getSnapshot()
    const unsubscribe = source.subscribe(() => undefined)
    expect(source.getSnapshot()).toBe(rendered)
    unsubscribe()
  })
})
