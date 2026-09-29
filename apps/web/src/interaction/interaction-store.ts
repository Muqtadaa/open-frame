import type { ObjectId } from '@openframe/core'
import { create } from 'zustand'

import { chromeSlice } from './store/chrome.js'
import { discussionSlice } from './store/discussion.js'
import { gestureSlice } from './store/gesture.js'
import { selectionSlice } from './store/selection.js'
import type { InteractionState } from './store/state.js'
import { toolsSlice } from './store/tools.js'
import { viewportSlice } from './store/viewport.js'

export type {
  ComposingComment,
  ConnectMake,
  ContextMenuAt,
  DragState,
  InteractionState,
  ToastAction,
  Tool,
  WheelMode,
} from './store/state.js'

/**
 * TRANSIENT, CLIENT-ONLY state, as one store made of slices.
 *
 * It was one 739-line `create()` holding about thirty fields and fifty
 * actions, so the one question anybody adding a field has to answer — which
 * part of the interface does this belong to? — had no place to be answered.
 * Each concern is now a slice in `store/`, declared in `store/state.ts` and
 * implemented beside it. It is still ONE store: every selector, subscription
 * and `getState()` in the app reads it exactly as before.
 *
 * A key two slices both define would be kept from the later one without a
 * word, since this is a spread; `store/slices.test.ts` holds them disjoint.
 */
export const useInteractionStore = create<InteractionState>()((...a) => ({
  ...toolsSlice(...a),
  ...selectionSlice(...a),
  ...viewportSlice(...a),
  ...gestureSlice(...a),
  ...discussionSlice(...a),
  ...chromeSlice(...a),
}))

/** Selector helper so components subscribe to one object's selected-ness. */
export const selectIsSelected =
  (id: ObjectId) =>
  (state: InteractionState): boolean =>
    state.selection.has(id)
