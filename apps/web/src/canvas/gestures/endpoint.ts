import type { ConnectorEndpoint } from '@openframe/core'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { anchorReach } from '../../scene/connect-points.js'
import { moveLine, reshapeOf } from './line.js'
import {
  gestureAt,
  type Gesture,
  type GestureContext,
  type GestureHandler,
  type InteractionSnapshot,
} from './types.js'

/**
 * Sets up a drag of one existing endpoint.
 *
 * Returns `null` — leaving the press to fall through to ordinary handling — if
 * anything about the grab does not add up, rather than starting a gesture that
 * cannot commit.
 *
 * The preview reuses the connect drag: it anchors at the end NOT being dragged,
 * so the line rubber-bands from the fixed end to the pointer exactly as drawing
 * a new connector does, and the object under the pointer highlights for free.
 * Nothing is written until pointer-up (rule 4).
 */
export function beginEndpointDrag(
  { runtime, toWorld }: GestureContext,
  event: ReactPointerEvent<HTMLElement>,
  store: InteractionSnapshot,
): Gesture | null {
  const element = event.target instanceof HTMLElement ? event.target : null
  const endpointId = element?.closest<HTMLElement>('[data-endpoint-id]')?.dataset.endpointId
  if (endpointId === undefined) return null

  const [selectedId] = [...store.selection]
  const doc = runtime.store.getDocument()
  const object = selectedId === undefined ? undefined : doc.objects.get(selectedId)
  if (object === undefined) return null

  const endpoints = runtime.registry.endpointsOf(object, doc)
  const fixed = endpoints.find((endpoint) => endpoint.id !== endpointId)
  if (fixed === undefined) return null

  const anchor: ConnectorEndpoint =
    fixed.attachedTo === undefined
      ? { kind: 'point', x: fixed.at.x, y: fixed.at.y }
      : { kind: 'object', objectId: fixed.attachedTo, anchor: { kind: 'auto' } }

  const worldStart = toWorld(event.clientX, event.clientY)
  store.beginConnect(anchor, worldStart)

  return gestureAt(event, 'endpoint', worldStart, store.viewport, {
    subjects: [object],
    endpointId,
  })
}

export const endpoint: GestureHandler = {
  move: moveLine,
  commit: ({ runtime, commands }, active, _event, store) => {
    if (active.endpointId === null || store.drag.kind !== 'connect') return
    const subject = active.subjects[0]
    const { to, over, reshaping } = store.drag
    if (subject !== undefined && active.moved && reshaping?.objectId === subject.id) {
      /*
       * COMMIT WHAT WAS DRAWN, and let the type settle it.
       *
       * The same question, from the same place, against the PREVIEWED
       * object rather than the committed one — asking from committed data
       * would let a snap that holds its shape by reading its own last
       * answer go at the moment of release. So the answer is the shape
       * already on screen, plus anything only a release may do: a stop
       * merged into its neighbour is dropped from the list here, where no
       * further pointer event can be confused by the indices moving.
       */
      const settled = reshapeOf(
        active,
        to,
        { store: runtime.store, registry: runtime.registry },
        reshaping,
        store.viewport.zoom,
        true,
      )
      commands.updateData(subject.id, settled?.data ?? reshaping.data)
    } else if (subject !== undefined && active.moved) {
      commands.retargetEndpoint(
        subject.id,
        active.endpointId,
        /*
         * The drop POINT travels either way. A type that attaches cares
         * only what was under the pointer; a dragged point that attaches
         * to nothing — a connector's bend — needs where the pointer
         * actually was, and objects cover most of a working board.
         */
        over === null
          ? {
              kind: 'point',
              x: to.x,
              y: to.y,
              tolerance: anchorReach(store.viewport.zoom),
              final: true,
            }
          : {
              kind: 'object',
              objectId: over,
              x: to.x,
              y: to.y,
              /*
               * How precise a pointer is, in world units at this zoom.
               * The type uses it to tell "dropped on that anchor" from
               * "dropped on the object" — and a constant here would mean
               * something different at 25% than at 400%, which is the
               * whole reason it travels with the drop rather than living
               * in the type.
               */
              tolerance: anchorReach(store.viewport.zoom),
              final: true,
            },
      )
    }
  },
}
