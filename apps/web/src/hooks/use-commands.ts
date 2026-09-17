import type { ColorToken, ObjectId, Point } from '@openframe/core'
import { useMemo } from 'react'

import { useOpenFrame } from '../app/runtime-context.js'
import { useInteractionStore } from '../interaction/interaction-store.js'

export interface BoardCommands {
  /** Creates any registered type. No per-type method — that is the registry's job. */
  createObject(type: string, at: Point, data?: Readonly<Record<string, unknown>>): ObjectId | null
  duplicateSelection(): void
  selectAll(): void
  moveObjects(moves: readonly { id: ObjectId; dx: number; dy: number }[]): void
  deleteSelection(): void
  setText(id: ObjectId, text: string): void
  setColor(ids: readonly ObjectId[], color: ColorToken): void
  undo(): void
  redo(): void
}

/**
 * The thin bridge between React and the command layer.
 *
 * Deliberately thin: it constructs commands and reports failures, and contains
 * no business rules whatsoever. Validation, locking, authorization, ordering
 * and undo all happen on the other side of `dispatch`, where they can be tested
 * without a renderer and reused by AI, the API and MCP.
 *
 * If logic starts accumulating here, it belongs in a command handler instead.
 */
/** Enough offset that a copy is visibly a copy, not a misclick. */
const DUPLICATE_OFFSET = 24

export function useCommands(): BoardCommands {
  const { runtime } = useOpenFrame()
  const dispatcher = runtime.dispatcher

  return useMemo<BoardCommands>(() => {
    const report = (result: { ok: boolean; error?: unknown }): void => {
      if (!result.ok) console.warn('[openframe] command rejected', result.error)
    }

    return {
      createObject(type, at, data) {
        const definition = runtime.registry.get(type)
        if (definition === undefined) {
          console.warn(`[openframe] no such object type "${type}"`)
          return null
        }
        // Centre the new object on the click point, which is what users expect.
        // The default size comes from the type, so this stays correct for types
        // that do not exist yet.
        const { frame } = definition.create(data === undefined ? undefined : { ...data })
        const result = dispatcher.dispatch({
          kind: 'CreateObjects',
          objects: [
            {
              type,
              x: at.x - frame.width / 2,
              y: at.y - frame.height / 2,
              ...(data === undefined ? {} : { data: { ...data } }),
            },
          ],
        })
        report(result)
        return result.ok ? (result.affected[0] ?? null) : null
      },

      duplicateSelection() {
        const store = useInteractionStore.getState()
        const document = runtime.store.getDocument()
        const sources = [...store.selection]
          .map((id) => document.objects.get(id))
          .filter((object) => object !== undefined)
        if (sources.length === 0) return

        // Built from ordinary CreateObjects rather than a bespoke command: the
        // copy goes through the same validation and history as anything else.
        const result = dispatcher.dispatch({
          kind: 'CreateObjects',
          objects: sources.map((object) => ({
            type: object.type,
            x: object.frame.x + DUPLICATE_OFFSET,
            y: object.frame.y + DUPLICATE_OFFSET,
            width: object.frame.width,
            height: object.frame.height,
            style: object.style,
            data: { ...(object.data as Record<string, unknown>) },
          })),
        })
        report(result)
        if (result.ok) store.setSelection(result.affected)
      },

      selectAll() {
        const ids = [...runtime.store.getDocument().objects.values()]
          .filter((object) => !object.hidden && !object.locked)
          .map((object) => object.id)
        useInteractionStore.getState().setSelection(ids)
      },

      moveObjects(moves) {
        if (moves.length === 0) return
        report(dispatcher.dispatch({ kind: 'MoveObjects', moves }))
      },

      deleteSelection() {
        const ids = [...useInteractionStore.getState().selection]
        if (ids.length === 0) return
        report(dispatcher.dispatch({ kind: 'DeleteObjects', ids }))
        useInteractionStore.getState().clearSelection()
      },

      setText(id, text) {
        report(dispatcher.dispatch({ kind: 'UpdateObjectData', id, patch: { text } }))
      },

      setColor(ids, color) {
        if (ids.length === 0) return
        report(dispatcher.dispatch({ kind: 'UpdateStyle', ids: [...ids], style: { color } }))
      },

      undo() {
        dispatcher.undo()
        useInteractionStore
          .getState()
          .pruneSelection((id) => runtime.store.getObject(id) !== undefined)
      },

      redo() {
        dispatcher.redo()
        useInteractionStore
          .getState()
          .pruneSelection((id) => runtime.store.getObject(id) !== undefined)
      },
    }
  }, [dispatcher, runtime.registry, runtime.store])
}
