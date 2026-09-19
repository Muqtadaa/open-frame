import { describe, expect, it } from 'vitest'

import { applyPatches, invertPatches, affectedIds, isStructural } from '../domain/patch.js'
import type { Patch } from '../domain/patch.js'
import { richFromPlain } from '../domain/rich-text.js'
import { createTestHarness } from '../testing.js'

/**
 * Renaming a board, which is the first change this system has ever made to the
 * document rather than to an object.
 *
 * It exists as a command, and `Patch` gained a fourth operation to carry it,
 * because a board's name IS document state: renaming it is a persistent
 * mutation, and the alternative was writing straight to the repository — the
 * second mutation path rule 3 forbids.
 */

describe('renaming a board', () => {
  it('changes the title', () => {
    const h = createTestHarness()

    const result = h.dispatcher.dispatch({ kind: 'SetBoardTitle', title: 'Pricing research' })

    expect(result.ok).toBe(true)
    expect(h.store.getDocument().meta.title).toBe('Pricing research')
  })

  it('is undone in one step', () => {
    const h = createTestHarness()
    const before = h.store.getDocument().meta.title

    h.dispatcher.dispatch({ kind: 'SetBoardTitle', title: 'Pricing research' })
    h.dispatcher.undo()

    expect(h.store.getDocument().meta.title).toBe(before)
  })

  it('is redone', () => {
    const h = createTestHarness()

    h.dispatcher.dispatch({ kind: 'SetBoardTitle', title: 'Pricing research' })
    h.dispatcher.undo()
    h.dispatcher.redo()

    expect(h.store.getDocument().meta.title).toBe('Pricing research')
  })

  it('trims what it is given', () => {
    const h = createTestHarness()

    h.dispatcher.dispatch({ kind: 'SetBoardTitle', title: '  Pricing research \n' })

    expect(h.store.getDocument().meta.title).toBe('Pricing research')
  })

  /**
   * An emptied input is the ordinary way to reach this, and a board with no
   * name is a row in the list nobody can tell apart.
   */
  it('refuses a name that is empty or only spaces', () => {
    const h = createTestHarness()
    const before = h.store.getDocument().meta.title

    for (const title of ['', '   ', '\t\n']) {
      const result = h.dispatcher.dispatch({ kind: 'SetBoardTitle', title })
      expect(result.ok).toBe(false)
    }
    expect(h.store.getDocument().meta.title).toBe(before)
  })

  it('refuses a name longer than the column that stores it', () => {
    const h = createTestHarness()

    const result = h.dispatcher.dispatch({ kind: 'SetBoardTitle', title: 'x'.repeat(201) })

    expect(result.ok).toBe(false)
  })

  /** Renaming to the same name must not leave an undo step that does nothing. */
  it('produces no history when the name does not change', () => {
    const h = createTestHarness()
    const title = h.store.getDocument().meta.title
    const depth = h.dispatcher.undoStack.depth

    const result = h.dispatcher.dispatch({ kind: 'SetBoardTitle', title })

    expect(result.ok).toBe(true)
    expect(h.dispatcher.undoStack.depth).toBe(depth)
  })

  it('leaves the objects alone', () => {
    const h = createTestHarness()
    h.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 0, y: 0, data: { text: richFromPlain('note') } }],
    })
    const objects = h.store.getDocument().objects

    h.dispatcher.dispatch({ kind: 'SetBoardTitle', title: 'Pricing research' })

    // The same Map instance: a rename must not invalidate the renderer's
    // reference comparison and repaint the whole board.
    expect(h.store.getDocument().objects).toBe(objects)
  })
})

describe('the meta patch', () => {
  const rename = (value: string): Patch => ({ op: 'meta', path: ['title'], value })

  it('names no object, so nothing re-renders for it', () => {
    expect(affectedIds([rename('x')])).toEqual([])
  })

  it('is not structural, so no index is rebuilt for it', () => {
    expect(isStructural([rename('x')])).toBe(false)
  })

  it('round-trips through invert', () => {
    const h = createTestHarness()
    const before = h.store.getDocument()
    const forward = [rename('Pricing research')]

    const after = applyPatches(before, forward)
    const back = applyPatches(after, invertPatches(before, forward))

    expect(after.meta.title).toBe('Pricing research')
    expect(back.meta.title).toBe(before.meta.title)
  })

  /**
   * One segment, enforced. `meta` maps to a flat key-value space on both sides
   * of the CRDT translation, and a nested path would need a nested map on the
   * other side — refused here rather than silently mistranslated.
   */
  it('refuses a path that is not a single field', () => {
    const h = createTestHarness()
    const doc = h.store.getDocument()

    expect(() =>
      applyPatches(doc, [{ op: 'meta', path: [] as unknown as [string], value: 'x' }]),
    ).toThrow()
    expect(() =>
      applyPatches(doc, [
        { op: 'meta', path: ['a', 'b'] as unknown as [string], value: 'x' },
      ]),
    ).toThrow()
  })
})
