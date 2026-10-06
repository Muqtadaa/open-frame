import { describe, expect, it } from 'vitest'

import { asObjectId, type ObjectId } from '../domain/ids.js'
import { richFromPlain } from '../domain/rich-text.js'
import { readOnlyCapabilities } from '../ports/capabilities.js'
import { createTestHarness, type TestHarness } from '../testing.js'

/**
 * Putting a board back to an earlier version (ADR 0019): one command, one undo
 * entry, and never a board put back with any of its objects missing (rule 7).
 */

const id = (name: string): ObjectId => asObjectId(`obj_${name}`)

function note(h: TestHarness, name: string, text = name): void {
  const made = h.dispatcher.dispatch({
    kind: 'CreateObjects',
    objects: [{ id: id(name), type: 'sticky', x: 0, y: 0, data: { text: richFromPlain(text) } }],
  })
  if (!made.ok) throw made.error
}

/** The board as a version holds it: its objects as stored, and its title. */
function version(h: TestHarness): { objects: unknown[]; title: string } {
  const doc = h.store.getDocument()
  return { objects: structuredClone([...doc.objects.values()]), title: doc.meta.title }
}

function texts(h: TestHarness): string[] {
  return [...h.store.getDocument().objects.values()]
    .map((o) => JSON.stringify((o.data as { text?: unknown }).text))
    .sort()
}

describe('restoring a version', () => {
  it('puts back what was added, removed and changed since, and the title', () => {
    const h = createTestHarness()
    note(h, 'kept')
    note(h, 'changed', 'before')
    note(h, 'deleted')
    const then = version(h)
    const before = texts(h)

    h.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [id('deleted')] })
    h.dispatcher.dispatch({
      kind: 'UpdateObjectData',
      id: id('changed'),
      patch: { text: richFromPlain('after') },
    })
    note(h, 'added')
    h.dispatcher.dispatch({ kind: 'SetBoardTitle', title: 'Renamed' })

    const restored = h.dispatcher.dispatch({ kind: 'RestoreBoard', ...then })
    expect(restored.ok).toBe(true)
    expect(texts(h)).toEqual(before)
    expect(h.store.getDocument().meta.title).toBe('Test board')
  })

  it('is one undo entry, and undo returns the board as it was before', () => {
    const h = createTestHarness()
    note(h, 'a')
    const then = version(h)
    note(h, 'b')
    const now = texts(h)

    h.dispatcher.dispatch({ kind: 'RestoreBoard', ...then })
    expect(texts(h)).toHaveLength(1)
    h.dispatcher.undo()
    expect(texts(h)).toEqual(now)
  })

  it('refuses the whole version when any object in it cannot be read', () => {
    const h = createTestHarness()
    note(h, 'a')
    const then = version(h)
    note(h, 'b')
    const now = texts(h)

    const result = h.dispatcher.dispatch({
      kind: 'RestoreBoard',
      objects: [...then.objects, { id: 'obj_bad', type: 'sticky', frame: 'wide' }],
      title: then.title,
    })
    expect(result.ok).toBe(false)
    // Nothing at all was written: not the readable objects, not the removal.
    expect(texts(h)).toEqual(now)
  })

  it('refuses a version that names one object twice', () => {
    const h = createTestHarness()
    note(h, 'a')
    const then = version(h)
    const result = h.dispatcher.dispatch({
      kind: 'RestoreBoard',
      objects: [...then.objects, ...then.objects],
      title: then.title,
    })
    expect(result.ok).toBe(false)
  })

  it('puts back lock state too, rather than being stopped by a lock', () => {
    const h = createTestHarness()
    note(h, 'a')
    const then = version(h)
    h.dispatcher.dispatch({ kind: 'SetLocked', ids: [id('a')], locked: true })
    note(h, 'b')

    expect(h.dispatcher.dispatch({ kind: 'RestoreBoard', ...then }).ok).toBe(true)
    expect(h.store.getDocument().objects.get(id('a'))?.locked).toBe(false)
    expect(h.store.getDocument().objects.has(id('b'))).toBe(false)
  })

  it('is refused to somebody who may only view the board', () => {
    const h = createTestHarness({ capabilities: readOnlyCapabilities() })
    const result = h.dispatcher.dispatch({ kind: 'RestoreBoard', objects: [], title: 'x' })
    expect(result.ok).toBe(false)
  })
})
