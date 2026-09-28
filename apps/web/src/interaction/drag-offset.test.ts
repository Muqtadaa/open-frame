import type { ObjectId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { translateOffset } from './drag-offset.js'
import type { DragState } from './interaction-store.js'

const dragged = 'dragged' as ObjectId
const bystander = 'bystander' as ObjectId

/**
 * A drag re-renders what it moves and nothing else (audit 2026-09-27, P1).
 *
 * The selector used to return the live delta to every object on the board,
 * so each pointer move re-rendered every visible object — 459 renders for 10
 * moves of one note among 51, and 40–90ms of script per move on a throttled
 * laptop. Zustand re-renders a subscriber when its selector's result changes,
 * so the test is simply what a bystander's selector returns as the drag moves.
 */
describe('translateOffset', () => {
  const at = (dx: number, dy: number): DragState => ({
    kind: 'translate',
    ids: new Set([dragged]),
    dx,
    dy,
  })

  it('follows the pointer for an object being dragged', () => {
    expect(translateOffset(at(12, -4), dragged, 'dx')).toBe(12)
    expect(translateOffset(at(12, -4), dragged, 'dy')).toBe(-4)
  })

  it('stays constant for everything else, so nothing else re-renders', () => {
    const seen = new Set(
      [at(1, 1), at(20, 5), at(-30, 44)].flatMap((drag) => [
        translateOffset(drag, bystander, 'dx'),
        translateOffset(drag, bystander, 'dy'),
      ]),
    )
    expect([...seen]).toEqual([0])
  })

  it('is zero when nothing is being dragged', () => {
    expect(translateOffset({ kind: 'idle' }, dragged, 'dx')).toBe(0)
  })
})
