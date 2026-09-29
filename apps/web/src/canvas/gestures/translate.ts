import { visibleWorldRect, type AnyOpenFrameObject, type ObjectId } from '@openframe/core'

import { exceedsDragThreshold } from '../../interaction/pointer-controller.js'
import { alignmentTargets } from '../../scene/alignment.js'
import { cullToViewport } from '../../scene/culling.js'
import { containerAt } from '../../scene/hit-testing.js'
import { resolveDragDelta } from './drag-delta.js'
import type { GestureHandler } from './types.js'

/**
 * Dragging the selection. Snaps as ONE unit (rule 17), aligning to the
 * neighbours it was near at the press, and drops into a frame by where the
 * pointer lets go.
 */
export const translate: GestureHandler = {
  prepare: ({ runtime }, settled) => {
    const doc = runtime.store.getDocument()
    return {
      subjects: [...settled.selection]
        .map((id) => doc.objects.get(id))
        .filter((object): object is AnyOpenFrameObject => object !== undefined),
      alignTargets: alignmentTargets(
        doc,
        runtime.registry,
        cullToViewport(
          doc,
          runtime.registry,
          visibleWorldRect(settled.viewport, settled.canvasSize.width, settled.canvasSize.height),
        ),
        settled.selection,
      ),
    }
  },

  move: (_ctx, active, event, worldPoint, store) => {
    // A press with a tremor must not become a move command that fills the
    // undo stack with actions the user never took.
    if (
      !active.moved &&
      !exceedsDragThreshold(active.startWorld, worldPoint, store.viewport.zoom)
    ) {
      return
    }
    active.moved = true
    const raw = { x: worldPoint.x - active.startWorld.x, y: worldPoint.y - active.startWorld.y }
    /*
     * Cmd/Ctrl suspends snapping for this gesture without touching the
     * preference — the convention in design tools, and the only override
     * that can be reached while already dragging.
     */
    const snapping = store.snapToGrid && !(event.metaKey || event.ctrlKey)
    const delta = resolveDragDelta(
      active.startBounds,
      active.alignTargets,
      raw,
      snapping,
      store.viewport.zoom,
    )
    store.setGuides(delta.guides)
    store.updateTranslate(delta.x, delta.y)
  },

  // The ids come from the live drag state rather than a copy taken at
  // pointer-down: caching them invites exactly the staleness bug where a
  // click that both selects and starts a drag commits an empty move.
  commit: ({ runtime, commands, toWorld }, active, event, store) => {
    if (!active.moved || store.drag.kind !== 'translate') return
    const { dx, dy, ids } = store.drag
    const moves = [...ids].map((id) => ({ id, dx, dy }))
    const document = runtime.store.getDocument()

    /*
     * Dropping onto a frame changes membership. The excluded set is the
     * dragged objects and everything inside them, so a frame cannot be
     * dropped into itself or into its own contents.
     */
    const excluded = new Set<ObjectId>()
    const stack = [...ids]
    while (stack.length > 0) {
      const id = stack.pop()
      if (id === undefined || excluded.has(id)) continue
      excluded.add(id)
      for (const object of document.objects.values()) {
        if (object.parentId === id) stack.push(object.id)
      }
    }

    const target = containerAt(
      document,
      runtime.registry,
      toWorld(event.clientX, event.clientY),
      excluded,
    )
    const currentParents = new Set([...ids].map((id) => document.objects.get(id)?.parentId ?? null))
    const membershipChanged = currentParents.size !== 1 || !currentParents.has(target)

    if (membershipChanged) commands.moveAndReparent(moves, target)
    else commands.moveObjects(moves)
  },
}
