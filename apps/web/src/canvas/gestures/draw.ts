import { committedRect } from '../../scene/draw.js'
import type { GestureHandler } from './types.js'

/** Sweeping out a NEW object's size, before anything exists. */
export const draw: GestureHandler = {
  move: (_ctx, active, event, worldPoint, store) => {
    active.moved = true
    // Shift is read per FRAME, not at gesture start: a user decides a shape
    // should be square halfway through drawing it, which is exactly when
    // they reach for the key.
    store.updateDraw(worldPoint, event.shiftKey)
  },
  commit: ({ commands }, _active, _event, store) => {
    if (store.drag.kind !== 'draw') return
    const { objectType, data, origin, current, constrained } = store.drag
    const rect = committedRect(origin, current, constrained, store.snapToGrid)
    /*
     * A gesture too small to be a drag falls back to click-to-place, at the
     * type's own default size and centred where the pointer went down. The
     * shape tool must still work with a single click.
     */
    const id =
      rect === null
        ? commands.createObject(objectType, origin, data)
        : commands.createObjectInRect(objectType, rect, data)
    if (id !== null) {
      store.setSelection([id])
      /*
       * Back to the select tool, exactly as click-to-place does. Without
       * this the shape tool stays armed and the very next click — the one
       * that commits the label you just typed — draws a second shape.
       */
      store.setTool('select')
      // The next thing anyone does with a new shape or frame is name it.
      store.setEditing(id)
    }
  },
}
