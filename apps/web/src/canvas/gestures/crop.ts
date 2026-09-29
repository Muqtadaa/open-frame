import { FULL_CROP, type ImageCrop } from '@openframe/core'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { croppedBy } from '../CropOverlay.js'
import {
  gestureAt,
  type Gesture,
  type GestureContext,
  type GestureHandler,
  type InteractionSnapshot,
} from './types.js'

/**
 * Grabbing one of an image's crop grips.
 *
 * The subject is the object being CROPPED rather than the selection, because
 * crop mode is about one object by definition — and the two can disagree for
 * an instant while a click lands.
 */
export function beginCropDrag(
  { runtime, toWorld }: GestureContext,
  event: ReactPointerEvent<HTMLElement>,
  store: InteractionSnapshot,
): Gesture | null {
  const element = event.target instanceof HTMLElement ? event.target : null
  const handle = element?.closest<HTMLElement>('[data-crop-handle]')?.dataset.cropHandle
  if (handle === undefined || store.croppingId === null) return null

  const doc = runtime.store.getDocument()
  const object = doc.objects.get(store.croppingId)
  if (object === undefined || object.locked) return null

  store.beginCrop(object.id, handle)

  return gestureAt(event, 'crop', toWorld(event.clientX, event.clientY), store.viewport, {
    subjects: [object],
    startBounds: runtime.registry.boundsOf(object, doc),
    dividerId: handle,
  })
}

export const crop: GestureHandler = {
  move: (_ctx, active, _event, world, store) => {
    const subject = active.subjects[0]
    if (subject === undefined || active.dividerId === undefined) return
    const result = croppedBy(
      subject.frame,
      (subject.data as { crop?: ImageCrop | null }).crop ?? FULL_CROP,
      active.dividerId,
      world.x - active.startWorld.x,
      world.y - active.startWorld.y,
    )
    if (result === null) return
    /*
     * `moved` is set PER MODE, and a gesture that never sets it commits
     * nothing on release — the guard exists so a press with a tremor
     * does not fill the undo stack with actions nobody took. Marked on
     * the frame actually changing rather than on the pointer twitching,
     * which is the same distinction the divider drag makes.
     */
    if (
      result.frame.width !== subject.frame.width ||
      result.frame.height !== subject.frame.height
    ) {
      active.moved = true
    }
    store.previewCrop(result.frame, result.crop)
  },
  commit: ({ commands }, active, _event, store) => {
    const drag = store.drag
    if (drag.kind === 'crop' && drag.frame !== null && drag.crop !== null && active.moved) {
      // One transaction: the window shown and the box showing it are two
      // kinds of change that only mean anything together.
      commands.cropImage(drag.objectId, drag.crop, drag.frame)
    }
  },
}
