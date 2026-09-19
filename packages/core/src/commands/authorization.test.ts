import { describe, expect, it } from 'vitest'

import { asObjectId, type ObjectId } from '../domain/ids.js'
import type { Patch } from '../domain/patch.js'
import { richFromPlain } from '../domain/rich-text.js'
import type { BoardAction, Capabilities } from '../ports/capabilities.js'
import { readOnlyCapabilities } from '../ports/capabilities.js'
import { fixedClock } from '../ports/clock.js'
import { createSequentialIdGenerator } from '../ports/id-generator.js'
import { createTestHarness } from '../testing.js'
import { CommandDispatcher } from './dispatcher.js'

/**
 * What a capability governs, and what it does not.
 *
 * A viewer is somebody WATCHING a board other people are editing. Everything
 * here follows from that sentence: they may not originate a change, and they
 * must receive every change anyone else makes. The second half was wrong —
 * `dispatch` asked `edit` of a merged change, the viewer's own capabilities
 * said no, and the board stopped updating. Nothing surfaced an error to the
 * person; they sat looking at a board that had quietly stopped being true.
 */

const id = (name: string): ObjectId => asObjectId(`obj_${name}`)

const moveOne: readonly Patch[] = [{ op: 'set', id: id('one'), path: ['frame', 'x'], value: 42 }]

/**
 * A board with one note, then the actor's access narrowed.
 *
 * The note is created through the ordinary path while editing is still
 * permitted, because the case worth testing is a board somebody is ALREADY
 * looking at when it turns out they may only watch it — which is exactly what
 * opening a view-only link produces.
 */
function watching(capabilities: Capabilities) {
  const seed = createTestHarness()
  const created = seed.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ id: id('one'), type: 'sticky', x: 0, y: 0, data: { text: richFromPlain('one') } }],
  })
  if (!created.ok) throw created.error

  const dispatcher = new CommandDispatcher({
    store: seed.store,
    writer: seed.writer,
    registry: seed.registry,
    clock: fixedClock(1_700_000_000_000),
    ids: createSequentialIdGenerator(),
    capabilities,
  })
  return { ...seed, dispatcher }
}

/** Nothing at all, not even `view` — a board this person was removed from. */
const noAccess: Capabilities = { can: () => false }

describe('a viewer', () => {
  it('cannot originate a change', () => {
    const h = watching(readOnlyCapabilities())

    const result = h.dispatcher.dispatch({
      kind: 'MoveObjects',
      moves: [{ id: id('one'), dx: 99, dy: 0 }],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('unauthorized')
    expect(h.store.getObject(id('one'))?.frame.x).toBe(0)
  })

  /**
   * The regression. Change `origin === 'remote' ? 'view' : 'edit'` back to a
   * bare `edit` in the dispatcher and this is what fails — the note never
   * moves, and the viewer is watching a board frozen at the moment they joined.
   */
  it('still receives what everyone else does', () => {
    const h = watching(readOnlyCapabilities())

    const result = h.dispatcher.dispatch(
      { kind: 'ApplyRemotePatches', patches: moveOne },
      { origin: 'remote', skipUndo: true },
    )

    expect(result.ok).toBe(true)
    expect(h.store.getObject(id('one'))?.frame.x).toBe(42)
  })

  it('does not accumulate undo history from other people’s changes', () => {
    const h = watching(readOnlyCapabilities())

    h.dispatcher.dispatch(
      { kind: 'ApplyRemotePatches', patches: moveOne },
      { origin: 'remote', skipUndo: true },
    )

    // Undo would otherwise let a viewer revert somebody else's work — an edit
    // by another name, and one the room would have every reason to reject.
    expect(h.dispatcher.undo()).toBeNull()
  })
})

describe('somebody with no access to the board', () => {
  /**
   * The positive control, and the reason this is not a bypass. `remote` lowers
   * the bar from `edit` to `view`; it does not remove it. A suite that only
   * covered the viewer would pass just as well against a dispatcher that
   * skipped the check for remote changes altogether.
   */
  it('has nothing merged into their document either', () => {
    const h = watching(noAccess)

    const result = h.dispatcher.dispatch(
      { kind: 'ApplyRemotePatches', patches: moveOne },
      { origin: 'remote', skipUndo: true },
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('unauthorized')
    expect(h.store.getObject(id('one'))?.frame.x).toBe(0)
  })
})

describe('the question the dispatcher asks', () => {
  it('is edit for your own change and view for a merged one', () => {
    const asked: BoardAction[] = []
    const h = watching({
      can: (action) => {
        asked.push(action)
        return true
      },
    })

    h.dispatcher.dispatch({ kind: 'MoveObjects', moves: [{ id: id('one'), dx: 5, dy: 0 }] })
    h.dispatcher.dispatch(
      { kind: 'ApplyRemotePatches', patches: moveOne },
      { origin: 'remote', skipUndo: true },
    )

    // Asserted directly, because WHICH question is asked is the entire change.
    // Checking only the outcome would pass against a dispatcher asking `view`
    // for both, which would let a viewer edit.
    expect(asked).toEqual(['edit', 'view'])
  })
})
