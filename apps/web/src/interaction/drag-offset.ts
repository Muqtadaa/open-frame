import type { ObjectId } from '@openframe/core'

import type { DragState } from './interaction-store.js'

/**
 * How far one object is being carried by a translate drag, on one axis.
 *
 * EVERY visible object runs this selector on every pointer move, so what it
 * returns decides what re-renders. An object that is not being dragged must
 * get a constant back.
 */
export function translateOffset(drag: DragState, id: ObjectId, axis: 'dx' | 'dy'): number {
  return drag.kind === 'translate' && drag.ids.has(id) ? drag[axis] : 0
}
