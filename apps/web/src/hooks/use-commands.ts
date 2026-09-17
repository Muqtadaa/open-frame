import type { ColorToken, ObjectId, Point } from '@openframe/core'
import { useMemo } from 'react'

import { useOpenFrame } from '../app/runtime-context.js'
import { useInteractionStore } from '../interaction/interaction-store.js'

export interface BoardCommands {
  createSticky(at: Point): ObjectId | null
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
export function useCommands(): BoardCommands {
  const { runtime } = useOpenFrame()
  const dispatcher = runtime.dispatcher

  return useMemo<BoardCommands>(() => {
    const report = (result: { ok: boolean; error?: unknown }): void => {
      if (!result.ok) console.warn('[openframe] command rejected', result.error)
    }

    return {
      createSticky(at) {
        const result = dispatcher.dispatch({
          kind: 'CreateObjects',
          // Centre the note on the click point, which is what users expect.
          objects: [{ type: 'sticky', x: at.x - 90, y: at.y - 90, data: { text: '' } }],
        })
        report(result)
        return result.ok ? (result.affected[0] ?? null) : null
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
  }, [dispatcher, runtime.store])
}
