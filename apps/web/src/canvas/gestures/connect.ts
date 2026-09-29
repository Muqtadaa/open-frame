import { attachmentAnchor } from '@openframe/core'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { anchorReach } from '../../scene/connect-points.js'
import { anchorForSide } from '../ConnectPoints.js'
import { moveLine } from './line.js'
import {
  gestureAt,
  type Gesture,
  type GestureContext,
  type GestureHandler,
  type InteractionSnapshot,
} from './types.js'

/**
 * Dragging off a connection point draws a connector FROM that object,
 * attached at the side the point sits on. Starting a line at the right
 * edge and having it leave from the left is the kind of thing that makes
 * a tool feel like it is arguing with you.
 */
export function beginConnectPointDrag(
  { toWorld }: GestureContext,
  event: ReactPointerEvent<HTMLElement>,
  store: InteractionSnapshot,
): Gesture | null {
  const side =
    event.target instanceof Element
      ? (event.target.closest<HTMLElement>('[data-connect-side]')?.dataset.connectSide ?? null)
      : null
  const [subject] = [...store.selection]
  if (subject === undefined || side === null) return null
  const at = toWorld(event.clientX, event.clientY)
  store.beginConnect({ kind: 'object', objectId: subject, anchor: anchorForSide(side) }, at)
  return gestureAt(event, 'connect', at, store.viewport)
}

/** Drawing a NEW line, which is made of whatever type the tool said. */
export const connect: GestureHandler = {
  move: moveLine,
  commit: ({ runtime, commands }, _active, _event, store) => {
    if (store.drag.kind !== 'connect') return
    const { from, to, over, make } = store.drag
    /*
     * A NEW line answers "where does this attach" exactly as a re-dragged
     * end does, through the same function in the type. Two answers to one
     * question is how drawing a connector onto an anchor and dropping an
     * existing one there came to behave differently.
     */
    const document = runtime.store.getDocument()
    const onto = over === null ? undefined : document.objects.get(over)
    const target =
      over === null || onto === undefined
        ? ({ kind: 'point', x: to.x, y: to.y } as const)
        : ({
            kind: 'object',
            objectId: over,
            anchor: attachmentAnchor(
              onto,
              { x: to.x, y: to.y },
              anchorReach(store.viewport.zoom),
              (other) => runtime.registry.boundsOf(other, document),
            ),
          } as const)

    // A connector to nowhere from nowhere is a stray click, not a gesture.
    const trivial =
      from.kind === 'point' &&
      target.kind === 'point' &&
      Math.hypot(target.x - from.x, target.y - from.y) < 8
    if (trivial) return
    const id = commands.createConnector(from, target, make)
    if (id !== null) {
      store.setSelection([id])
      store.setTool('select')
    }
  },
}
