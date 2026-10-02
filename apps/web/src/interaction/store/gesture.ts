import type { AlignmentGuide } from '../../scene/alignment.js'
import type { ConnectMake, GestureSlice, Slice } from './state.js'

/** One shared instance, so "no guides" never invalidates a selector. */
const NO_GUIDES: readonly AlignmentGuide[] = []
/**
 * The plain line: what a connect gesture makes when nothing armed says
 * otherwise — dragging out from a selected object's side, or re-aiming an end.
 */
const CONNECTOR: ConnectMake = { type: 'connector' }

/**
 * The gesture in flight and everything it previews — written nowhere until it commits (rule 4).
 */
export const gestureSlice: Slice<GestureSlice> = (set) => ({
  guides: NO_GUIDES,
  drag: { kind: 'idle' },
  stylePreview: null,
  measuring: false,

  // Written only when it changes: the key repeats while it is held.
  setMeasuring: (measuring) => set((state) => (state.measuring === measuring ? {} : { measuring })),
  setGuides: (guides) => set({ guides: guides.length === 0 ? NO_GUIDES : guides }),
  beginDivider: (objectId, dividerId) =>
    set({
      drag: { kind: 'divider', objectId, dividerId, data: null, grow: { width: 0, height: 0 } },
    }),
  beginCrop: (objectId, handle) =>
    set({ drag: { kind: 'crop', objectId, handle, frame: null, crop: null } }),
  previewCrop: (frame, crop) =>
    set((state) => (state.drag.kind === 'crop' ? { drag: { ...state.drag, frame, crop } } : {})),
  previewStyle: (ids, style) => set({ stylePreview: { ids, style } }),
  clearStylePreview: () => set({ stylePreview: null }),
  previewDivider: (data, grow) =>
    set((state) =>
      // Guarded: a preview arriving after the gesture ended would resurrect a
      // drag state nothing is going to commit.
      state.drag.kind === 'divider' ? { drag: { ...state.drag, data, grow } } : {},
    ),

  beginTranslate: (ids) => set({ drag: { kind: 'translate', ids: new Set(ids), dx: 0, dy: 0 } }),
  updateTranslate: (dx, dy) =>
    set((state) => (state.drag.kind === 'translate' ? { drag: { ...state.drag, dx, dy } } : {})),
  beginMarquee: (origin) => set({ drag: { kind: 'marquee', origin, current: origin } }),
  updateMarquee: (current) =>
    set((state) => (state.drag.kind === 'marquee' ? { drag: { ...state.drag, current } } : {})),
  beginDraw: (objectType, at, data) =>
    set({
      drag: { kind: 'draw', objectType, data, origin: at, current: at, constrained: false },
    }),
  updateDraw: (current, constrained) =>
    set((state) =>
      state.drag.kind === 'draw' ? { drag: { ...state.drag, current, constrained } } : {},
    ),
  beginPan: () => set({ drag: { kind: 'pan' } }),
  beginResize: (handle) => set({ drag: { kind: 'resize', handle, frames: new Map() } }),
  beginRotate: () => set({ drag: { kind: 'rotate', frames: new Map() } }),
  beginConnect: (from, at, make = CONNECTOR) =>
    set({ drag: { kind: 'connect', make, from, to: at, over: null, reshaping: null } }),
  updateConnect: (to, over, reshaping = null) =>
    set((state) =>
      state.drag.kind === 'connect' ? { drag: { ...state.drag, to, over, reshaping } } : {},
    ),
  previewFrames: (frames) =>
    set((state) =>
      state.drag.kind === 'resize' || state.drag.kind === 'rotate'
        ? { drag: { ...state.drag, frames } }
        : {},
    ),
  endDrag: () => set({ drag: { kind: 'idle' }, guides: NO_GUIDES }),
})
