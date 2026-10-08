import type { Slice, ToolsSlice, WheelMode } from './state.js'

const NO_OPTIONS: Readonly<Record<string, unknown>> = {}

const WHEEL_MODE_KEY = 'openframe.wheelMode'
const SNAP_KEY = 'openframe.snapToGrid'

function readSnap(): boolean {
  try {
    // Defaults ON: aligned boards are what people want, and the override is one
    // held key away. An explicit 'false' is the only thing that turns it off.
    return localStorage.getItem(SNAP_KEY) !== 'false'
  } catch {
    return true
  }
}

function writeSnap(enabled: boolean): void {
  try {
    localStorage.setItem(SNAP_KEY, String(enabled))
  } catch {
    // Same reason as the wheel preference: not worth failing startup over.
  }
}

function readWheelMode(): WheelMode {
  try {
    return localStorage.getItem(WHEEL_MODE_KEY) === 'pan' ? 'pan' : 'zoom'
  } catch {
    // Private windows and blocked site data both throw here. A preference is
    // not worth failing startup over.
    return 'zoom'
  }
}

function writeWheelMode(mode: WheelMode): void {
  try {
    localStorage.setItem(WHEEL_MODE_KEY, mode)
  } catch {
    // Ignored for the same reason.
  }
}

/**
 * The armed tool, what has been chosen for it, and this browser's input preferences.
 */
export const toolsSlice: Slice<ToolsSlice> = (set) => ({
  tool: 'select',
  toolOptions: NO_OPTIONS,
  wheelMode: readWheelMode(),
  snapToGrid: readSnap(),
  takingBack: false,

  // Reaches across two slices: choosing a tool ends an edit (selection) and
  // may open the comments panel (discussion).
  setTool: (tool) =>
    set((state) => ({
      tool,
      takingBack: false,
      editingId: null,
      // Choosing the comment tool opens the panel. Leaving the tool does NOT
      // close it: a thread you are reading should survive picking up select
      // to move something out of the way.
      commentsOpen: tool === 'comment' ? true : state.commentsOpen,
    })),

  setToolOptions: (type, options) =>
    set((state) => ({ toolOptions: { ...state.toolOptions, [type]: options } })),

  setWheelMode: (wheelMode) => {
    writeWheelMode(wheelMode)
    set({ wheelMode })
  },

  setTakingBack: (takingBack) => {
    set({ takingBack })
  },

  setSnapToGrid: (snapToGrid) => {
    writeSnap(snapToGrid)
    set({ snapToGrid })
  },

  toggleSnapToGrid: () =>
    set((state) => {
      const next = !state.snapToGrid
      writeSnap(next)
      return { snapToGrid: next }
    }),

  toggleWheelMode: () =>
    set((state) => {
      const next: WheelMode = state.wheelMode === 'zoom' ? 'pan' : 'zoom'
      writeWheelMode(next)
      return { wheelMode: next }
    }),
})
