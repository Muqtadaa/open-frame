import { create } from 'zustand'

import type { ObjectId } from '@openframe/core'
import type { DragDelta } from '../scene/presence.js'

/**
 * What other people are holding in mid-air, ready for the renderer.
 *
 * SEPARATE from the interaction store on purpose. That one is this browser's
 * own transient state and says so: presence is projected onto it and never
 * read back. Putting somebody else's drag in there would make "who is
 * authoritative for this field" a question with two answers.
 *
 * A store rather than a context because of how it is consumed. Every visible
 * object asks whether it is being moved, on every presence update — twenty a
 * second — and a context would re-render every one of them each time. Here the
 * selectors return NUMBERS, so an object only re-renders when its own offset
 * changes, which for almost every object is never.
 */
interface RemoteDragState {
  readonly drags: ReadonlyMap<ObjectId, DragDelta>
  readonly setDrags: (drags: ReadonlyMap<ObjectId, DragDelta>) => void
}

const NONE: ReadonlyMap<ObjectId, DragDelta> = new Map()

export const useRemoteDragStore = create<RemoteDragState>((set) => ({
  drags: NONE,
  setDrags: (drags) => {
    set((state) => {
      // An empty map replacing an empty map is the common case by a very large
      // margin — nobody is dragging anything, twenty times a second. Reusing
      // the same reference means no subscriber is woken at all.
      if (state.drags.size === 0 && drags.size === 0) return {}
      return { drags: drags.size === 0 ? NONE : drags }
    })
  },
}))

/** How far somebody else is holding this object from where the document has it. */
export function useRemoteDrag(id: ObjectId): DragDelta | null {
  // Two primitive selectors rather than one returning an object: a fresh
  // `{ dx, dy }` never compares equal under `Object.is`, and `useSyncExternal-
  // Store` then re-renders forever. Rule 9, which crashed the app once.
  const dx = useRemoteDragStore((state) => state.drags.get(id)?.dx ?? 0)
  const dy = useRemoteDragStore((state) => state.drags.get(id)?.dy ?? 0)
  const held = useRemoteDragStore((state) => state.drags.has(id))
  return held ? { dx, dy } : null
}
