import { asObjectId } from '@openframe/core'
import { beforeEach, describe, expect, it } from 'vitest'

import { useInteractionStore } from './interaction-store.js'

/**
 * The advisory lock, isolated.
 *
 * There are TWO guards and they overlap, which the browser test cannot tell
 * apart: with either one in place, a second person fails to open a note that
 * somebody else has. Removing both makes the browser test fail, so the
 * behaviour is covered — but each mechanism is a different case, and a guard
 * that no test can distinguish is a guard the next person deletes.
 */
const NOTE = asObjectId('obj_note')
const OTHER = asObjectId('obj_other')

beforeEach(() => {
  useInteractionStore.setState({
    editingId: null,
    lockedByOthers: new Set(),
  })
})

describe('editing something somebody else has open', () => {
  /** Guard one: the door. Refused outright, with no editor ever opening. */
  it('refuses to start', () => {
    const store = useInteractionStore.getState()
    store.setLockedByOthers(new Set([NOTE]))
    store.setEditing(NOTE)

    expect(useInteractionStore.getState().editingId).toBeNull()
  })

  it('still lets you edit anything else', () => {
    const store = useInteractionStore.getState()
    store.setLockedByOthers(new Set([NOTE]))
    store.setEditing(OTHER)

    expect(useInteractionStore.getState().editingId).toBe(OTHER)
  })

  /**
   * Guard two: the race. Both people double-click in the same instant, so the
   * claim arrives AFTER this client already opened its editor. The one that
   * arrives keeps it and this editor closes, rather than two people typing into
   * one note and watching each other's words disappear.
   */
  it('closes an editor that was already open when the claim arrives', () => {
    const store = useInteractionStore.getState()
    store.setEditing(NOTE)
    expect(useInteractionStore.getState().editingId).toBe(NOTE)

    store.setLockedByOthers(new Set([NOTE]))

    expect(useInteractionStore.getState().editingId).toBeNull()
  })

  it('leaves an editor alone when the claim is for something else', () => {
    const store = useInteractionStore.getState()
    store.setEditing(NOTE)
    store.setLockedByOthers(new Set([OTHER]))

    expect(useInteractionStore.getState().editingId).toBe(NOTE)
  })

  it('hands the note back when the other person lets go', () => {
    const store = useInteractionStore.getState()
    store.setLockedByOthers(new Set([NOTE]))
    store.setEditing(NOTE)
    expect(useInteractionStore.getState().editingId).toBeNull()

    store.setLockedByOthers(new Set())
    store.setEditing(NOTE)

    expect(useInteractionStore.getState().editingId).toBe(NOTE)
  })

  /** Closing an editor is never refused; only opening one is. */
  it('always lets you stop editing', () => {
    const store = useInteractionStore.getState()
    store.setEditing(NOTE)
    store.setLockedByOthers(new Set([OTHER]))
    store.setEditing(null)

    expect(useInteractionStore.getState().editingId).toBeNull()
  })
})
