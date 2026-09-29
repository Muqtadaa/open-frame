import { DEFAULT_VIEWPORT } from '@openframe/core'

import type { Slice, ViewportSlice } from './state.js'

/**
 * The camera: where the board is looked at from, whose view is being followed, how big the canvas is.
 */
export const viewportSlice: Slice<ViewportSlice> = (set) => ({
  viewport: DEFAULT_VIEWPORT,
  following: null,
  canvasSize: { width: 0, height: 0 },
  setViewport: (viewport) => set({ viewport }),
  setFollowing: (clientId) => set({ following: clientId }),

  setCanvasSize: (width, height) =>
    set((state) =>
      state.canvasSize.width === width && state.canvasSize.height === height
        ? {}
        : { canvasSize: { width, height } },
    ),
})
