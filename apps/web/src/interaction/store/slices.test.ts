import { describe, expect, it } from 'vitest'

import { useInteractionStore } from '../interaction-store.js'
import { chromeSlice } from './chrome.js'
import { discussionSlice } from './discussion.js'
import { gestureSlice } from './gesture.js'
import { selectionSlice } from './selection.js'
import type { InteractionState, Slice } from './state.js'
import { toolsSlice } from './tools.js'
import { viewportSlice } from './viewport.js'

/**
 * The store is its slices spread into one object, and a spread keeps the LAST
 * of two keys with the same name without a word. A field added to one slice
 * that another already has would quietly replace it — the first slice's
 * actions reading and writing something that is no longer theirs.
 */
const SLICES: Readonly<Record<string, Slice<object>>> = {
  tools: toolsSlice,
  selection: selectionSlice,
  viewport: viewportSlice,
  gesture: gestureSlice,
  discussion: discussionSlice,
  chrome: chromeSlice,
}

/** What a slice declares, without running any of its actions. */
function keysOf(slice: Slice<object>): string[] {
  const inert = () => undefined
  const state = () => ({}) as InteractionState
  return Object.keys(slice(inert, state, useInteractionStore))
}

describe('the interaction store', () => {
  it('owns each key in exactly one slice', () => {
    const owners = new Map<string, string[]>()
    for (const [name, slice] of Object.entries(SLICES)) {
      for (const key of keysOf(slice)) owners.set(key, [...(owners.get(key) ?? []), name])
    }
    const shared = [...owners].filter(([, names]) => names.length > 1)
    expect(shared).toEqual([])
  })

  it('is exactly its slices, with nothing dropped on the way', () => {
    const declared = Object.values(SLICES).flatMap(keysOf).sort()
    expect(Object.keys(useInteractionStore.getState()).sort()).toEqual(declared)
  })
})
