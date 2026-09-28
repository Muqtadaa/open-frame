import { panViewport } from '@openframe/core'

import type { GestureHandler } from './types.js'

/** Dragging the board itself. Writes the viewport and nothing else. */
export const pan: GestureHandler = {
  move: (_ctx, active, event, _worldPoint, store) => {
    store.setViewport(
      panViewport(
        active.startViewport,
        event.clientX - active.startClient.x,
        event.clientY - active.startClient.y,
      ),
    )
  },
  commit: () => undefined,
}
