import { rectFromPoints } from '@openframe/core'

import { objectsInMarquee } from '../../scene/hit-testing.js'
import type { GestureHandler } from './types.js'

/** Sweeping a box to select what it touches. Shift adds to the selection. */
export const marquee: GestureHandler = {
  move: (_ctx, active, _event, worldPoint, store) => {
    active.moved = true
    store.updateMarquee(worldPoint)
  },
  commit: ({ runtime }, _active, event, store) => {
    if (store.drag.kind !== 'marquee') return
    const region = rectFromPoints(store.drag.origin, store.drag.current)
    const ids = objectsInMarquee(runtime.store.getDocument(), runtime.registry, region)
    if (event.shiftKey) {
      store.setSelection([...new Set([...store.selection, ...ids])])
    } else {
      store.setSelection(ids)
    }
  },
}
