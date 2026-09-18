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

/**
 * Subscribes to the objects a given object's rendering depends on.
 *
 * A connector must redraw when either end moves, but per-object subscriptions —
 * which are what keep a large board fast — only wake it for changes to itself.
 * The registry declares the dependencies; this turns them into subscriptions.
 *
 * Returns a counter that changes whenever a dependency does, so callers can use
 * it as a render signal.
 */
export function useDependencySubscriptions(id: ObjectId): number {
  const { runtime } = useOpenFrame()

  const subscribe = useCallback(
    (onChange: () => void) => {
      const object = runtime.store.getObject(id)
      if (object === undefined) return () => undefined

      const unsubscribes = runtime.registry
        .dependenciesOf(object)
        .map((dependency) => runtime.store.subscribeToObject(dependency, onChange))

      /*
       * The dependency LIST can itself change — reattaching an endpoint points
       * the connector at a different object — so also watch the object, which
       * re-runs this subscription.
       */
      unsubscribes.push(runtime.store.subscribeToObject(id, onChange))
      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe()
      }
    },
    [runtime.registry, runtime.store, id],
  )

  const getSnapshot = useCallback(() => {
    const object = runtime.store.getObject(id)
    if (object === undefined) return 0
    // Version sum over dependencies: changes whenever any of them does, and is
    // a primitive so it is a valid snapshot.
    let signal = 0
    for (const dependency of runtime.registry.dependenciesOf(object)) {
      const target = runtime.store.getObject(dependency)
      if (target !== undefined) signal += target.frame.x + target.frame.y + target.frame.width
    }
    return signal
  }, [runtime.registry, runtime.store, id])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
