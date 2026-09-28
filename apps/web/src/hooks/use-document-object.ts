import type { AnyOpenFrameObject, BoardDocument, ObjectId } from '@openframe/core'
import { useCallback, useRef, useSyncExternalStore } from 'react'

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
 * A connector must redraw when either end changes, but per-object
 * subscriptions — which are what keep a large board fast — only wake it for
 * changes to itself. The registry says what it depends on
 * (`renderDependenciesOf`: the declared ends, and a group end's members, whose
 * bounds are the group's); this turns them into subscriptions.
 *
 * Returns a counter that moves on every notification, as a render signal. It
 * used to return `Σ(x + y + width)` over the ends, which a note made taller,
 * turned, or moved as far one way as the other left unchanged — and React,
 * comparing equal snapshots, skipped the redraw (tracks A-6).
 *
 * The subscriptions are REWIRED whenever the object or anything it depends on
 * changes: reattaching an end points the line at a different object, and a
 * member joining or leaving a group changes what the group's bounds are made
 * of. A subscription built once, on mount, went on listening to the old ones.
 */
export function useDependencySubscriptions(id: ObjectId): number {
  const { runtime } = useOpenFrame()
  const version = useRef(0)

  const subscribe = useCallback(
    (onChange: () => void) => {
      let wired: (() => void)[] = []
      const unwire = (): void => {
        for (const unsubscribe of wired) unsubscribe()
        wired = []
      }
      const changed = (): void => {
        wire()
        version.current += 1
        onChange()
      }
      let wiredIds = ''
      const wire = (): void => {
        unwire()
        const object = runtime.store.getObject(id)
        if (object === undefined) return
        const document = runtime.store.getDocument()
        const depends = runtime.registry.renderDependenciesOf(object, document)
        wiredIds = [...depends].sort().join(' ')
        wired = depends.map((dependency) => runtime.store.subscribeToObject(dependency, changed))
        /*
         * A member joining a group is a change to the MEMBER — a new object, or
         * one whose `parentId` was set — not to the group or to this line, and
         * nothing this line listens to says so. Reparenting is not even a
         * structural change. So a line with a group end hears every change to
         * the board and redraws only when what it depends on is different;
         * the members' own changes still arrive through their subscriptions.
         * Asked of the ends' types rather than of their members, because an
         * EMPTY group has none (Codex, on #18); and heard only by such a line,
         * or every line would recompute on every edit.
         */
        if (runtime.registry.dependsOnMembers(object, document)) {
          wired.push(
            runtime.store.subscribeToDocument(() => {
              const current = runtime.store.getObject(id)
              if (current === undefined) return
              const next = runtime.registry.renderDependenciesOf(
                current,
                runtime.store.getDocument(),
              )
              if ([...next].sort().join(' ') !== wiredIds) changed()
            }),
          )
        }
      }
      wire()
      const self = runtime.store.subscribeToObject(id, changed)
      return () => {
        unwire()
        self()
      }
    },
    [runtime.registry, runtime.store, id],
  )

  const getSnapshot = useCallback(() => version.current, [])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
