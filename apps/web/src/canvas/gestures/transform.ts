import type { AnyOpenFrameObject, ObjectFrame, ObjectId } from '@openframe/core'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { snapRect } from '../../scene/snapping.js'
import {
  CORNER_HANDLES,
  angleFrom,
  framesBounds,
  resizeBounds,
  scaleFrames,
  snapAngle,
  type HandleId,
} from '../../scene/resize.js'
import {
  gestureAt,
  type Gesture,
  type GestureContext,
  type GestureHandler,
  type InteractionSnapshot,
} from './types.js'

/**
 * Grabbing a resize grip or the rotate grip on the selection.
 *
 * Returns null — leaving the press to ordinary handling — when nothing
 * selected can be transformed.
 */
export function beginTransformDrag(
  { runtime, toWorld }: GestureContext,
  event: ReactPointerEvent<HTMLElement>,
  store: InteractionSnapshot,
  grabbed: string,
): Gesture | null {
  const document = runtime.store.getDocument()
  /*
   * Only the objects a transform can actually act on.
   *
   * A connector is not resizable and has no meaningful frame — a
   * vestigial 0x0 at the origin — so including one would stretch the
   * gesture's bounds all the way back to world zero. It does not need to
   * be transformed anyway: its geometry is derived from its endpoints, so
   * it follows whatever it is attached to for free.
   */
  const subjects = [...store.selection]
    .map((id) => document.objects.get(id))
    .filter((object): object is AnyOpenFrameObject => object !== undefined)
    .filter((object) => runtime.registry.get(object.type)?.capabilities.resizable === true)
  const startBounds = framesBounds(subjects)
  if (startBounds === null) return null

  const worldStart = toWorld(event.clientX, event.clientY)
  const centre = {
    x: startBounds.x + startBounds.width / 2,
    y: startBounds.y + startBounds.height / 2,
  }
  const rotating = grabbed === 'rotate'
  if (rotating) store.beginRotate()
  else store.beginResize(grabbed as HandleId)

  return gestureAt(event, rotating ? 'rotate' : 'resize', worldStart, store.viewport, {
    subjects,
    startBounds,
    handle: rotating ? null : (grabbed as HandleId),
    startAngle: angleFrom(centre, worldStart) - (subjects[0]?.frame.rotation ?? 0),
  })
}

/** Resize previews frames and writes them once (rule 14). */
export const resize: GestureHandler = {
  move: (_ctx, active, event, worldPoint, store) => {
    if (active.startBounds === null || active.handle === null) return
    active.moved = true
    const delta = {
      x: worldPoint.x - active.startWorld.x,
      y: worldPoint.y - active.startWorld.y,
    }
    const resized = resizeBounds(active.startBounds, active.handle, delta, {
      // Corners keep proportions by default; Shift releases that, matching
      // the convention in design tools.
      preserveAspect: CORNER_HANDLES.includes(active.handle) ? !event.shiftKey : event.shiftKey,
      fromCentre: event.altKey,
    })
    const next = store.snapToGrid && !(event.metaKey || event.ctrlKey) ? snapRect(resized) : resized
    store.previewFrames(toFrameMap(scaleFrames(active.subjects, active.startBounds, next)))
  },
  commit: ({ commands }, active, _event, store) => {
    if (!active.moved || store.drag.kind !== 'resize') return
    commands.resizeObjects([...store.drag.frames].map(([id, frame]) => ({ id, frame })))
  },
}

/** Rotate previews frames and writes the angles once (rule 14). */
export const rotate: GestureHandler = {
  move: (_ctx, active, event, worldPoint, store) => {
    if (active.startBounds === null) return
    active.moved = true
    const centre = {
      x: active.startBounds.x + active.startBounds.width / 2,
      y: active.startBounds.y + active.startBounds.height / 2,
    }
    const rotation = snapAngle(angleFrom(centre, worldPoint) - active.startAngle, event.shiftKey)
    store.previewFrames(
      new Map(active.subjects.map((object) => [object.id, { ...object.frame, rotation }])),
    )
  },
  commit: ({ commands }, active, _event, store) => {
    if (!active.moved || store.drag.kind !== 'rotate') return
    commands.rotateObjects(
      [...store.drag.frames].map(([id, frame]) => ({ id, rotation: frame.rotation })),
    )
  },
}

function toFrameMap(
  entries: readonly { readonly id: ObjectId; readonly frame: ObjectFrame }[],
): ReadonlyMap<ObjectId, ObjectFrame> {
  return new Map(entries.map((entry) => [entry.id, entry.frame]))
}
