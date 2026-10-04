import type { Command, ObjectId } from '@openframe/core'
import { useCallback, useMemo, useSyncExternalStore, type ComponentType } from 'react'

import { useCanEdit } from '../hooks/use-can-edit.js'
import { useMe } from '../hooks/use-me.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import type { ObjectViewProps, ViewMarks } from '../views/registry.js'

/**
 * A view that declares `readsMarks`, drawn with the marks on its object and a
 * way to add one.
 *
 * Its own component so that only those objects subscribe to the board's
 * structure and ask who is looking: every other object on the board renders
 * its view directly, as before.
 */
export function MarkedRenderer({
  Renderer,
  ...props
}: ObjectViewProps & { readonly Renderer: ComponentType<ObjectViewProps> }) {
  const { runtime } = useOpenFrame()
  const id = props.object.id
  const signature = useMarkSignature(id)
  const me = useMe()
  const canEdit = useCanEdit()

  const act = useCallback(
    (command: Command) => {
      const result = runtime.dispatcher.dispatch(command)
      if (!result.ok) {
        useInteractionStore
          .getState()
          .showToast(
            result.error.code === 'unauthorized'
              ? 'This board is read-only.'
              : result.error.message,
          )
      }
    },
    [runtime.dispatcher],
  )

  const marks = useMemo<ViewMarks>(
    () => ({
      on:
        signature === ''
          ? []
          : (JSON.parse(signature) as [string, string, string][]).map(([kind, value, by]) => ({
              kind,
              value,
              by,
            })),
      me,
      canAct: canEdit,
      act,
    }),
    [signature, me, canEdit, act],
  )

  return <Renderer {...props} marks={marks} />
}

/**
 * The marks on one object as a string that compares by value (rule 9), from
 * the registry's mark index — O(1) per object (rule 10).
 *
 * It hears the board's structure, for marks arriving and leaving, AND each
 * mark object on this one: an answer rewritten in place — a single-choice
 * answer changing option, an agent's edit — is not a structural change, and a
 * card that only heard structure kept its old counts (Codex, on #66).
 */
function useMarkSignature(id: ObjectId): string {
  const { runtime } = useOpenFrame()
  const subscribe = useCallback(
    (onChange: () => void) => {
      let unfollow: (() => void)[] = []
      const follow = (): void => {
        for (const stop of unfollow) stop()
        unfollow = runtime.registry
          .marksOn(runtime.store.getDocument(), id)
          .map((link) => runtime.store.subscribeToObject(link.id, onChange))
      }
      follow()
      const unstructure = runtime.store.subscribeToStructure(() => {
        follow()
        onChange()
      })
      return () => {
        unstructure()
        for (const stop of unfollow) stop()
      }
    },
    [runtime, id],
  )
  const getSnapshot = useCallback(() => {
    const rows = runtime.registry
      .marksOn(runtime.store.getDocument(), id)
      .map((link) => [link.edge.kind, link.edge.value, link.edge.by] as const)
    if (rows.length === 0) return ''
    return JSON.stringify(rows.sort((a, b) => (a.join('\u0000') < b.join('\u0000') ? -1 : 1)))
  }, [runtime, id])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
