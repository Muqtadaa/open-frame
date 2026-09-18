import type { AnyOpenFrameObject, BoardDocument, ObjectId } from '@openframe/core'
import { useCallback, useSyncExternalStore } from 'react'

import { useOpenFrame } from '../runtime/context.js'

/**
 * Subscribes a component to ONE object.
 *
 * This is the reason the document store keeps per-object listener channels: a
 * board with hundreds of visible objects has hundreds of these subscriptions,
 * and moving one object must wake exactly one of them. A store that notified
 * every subscriber on every change would turn each pointer-up into O(objects)
 * React work — invisible at ten objects, fatal at five thousand.
 *
 * `getObject` returns a stable reference until that object actually changes,
 * which is what makes it a valid `useSyncExternalStore` snapshot.
 */
export function useDocumentObject(id: ObjectId): AnyOpenFrameObject | undefined {
  const { runtime } = useOpenFrame()
  const subscribe = useCallback(
    (onChange: () => void) => runtime.store.subscribeToObject(id, onChange),
    [runtime.store, id],
  )
  const getSnapshot = useCallback(() => runtime.store.getObject(id), [runtime.store, id])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * Coarse subscription for consumers that need the whole board, such as culling.
 *
 * Returns the document itself rather than a version number: the store replaces
 * the document object on every change, so its identity is already a correct
 * `useSyncExternalStore` snapshot and a valid `useMemo` dependency.
 */
export function useBoardDocument(): BoardDocument {
  const { runtime } = useOpenFrame()
  const subscribe = useCallback(
    (onChange: () => void) => runtime.store.subscribeToDocument(onChange),
    [runtime.store],
  )
  const getSnapshot = useCallback(() => runtime.store.getDocument(), [runtime.store])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useUndoState(): { canUndo: boolean; canRedo: boolean; undoLabel: string | null } {
  const { runtime } = useOpenFrame()
  const stack = runtime.dispatcher.undoStack
  const subscribe = useCallback((onChange: () => void) => stack.subscribe(onChange), [stack])
  const getSnapshot = useCallback(
    () => `${String(stack.canUndo)}|${String(stack.canRedo)}|${stack.undoLabel ?? ''}`,
    [stack],
  )
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return { canUndo: stack.canUndo, canRedo: stack.canRedo, undoLabel: stack.undoLabel }
}
