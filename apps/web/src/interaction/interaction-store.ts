import {
  DEFAULT_VIEWPORT,
  SHAPE_KINDS,
  type AnyOpenFrameObject,
  type ConnectorEndpoint,
  type ObjectFrame,
  type ObjectId,
  type Point,
  type ShapeKind,
  type Viewport,
} from '@openframe/core'

import type { AlignmentGuide } from '../scene/alignment.js'
import type { HandleId } from '../scene/resize.js'
import { create } from 'zustand'

export type Tool = 'select' | 'pan' | 'sticky' | 'text' | 'shape' | 'frame' | 'connector'

/**
 * What a plain (unmodified) wheel gesture does.
 *
 * Mouse users overwhelmingly expect scroll to zoom on a canvas; trackpad users
 * often expect it to pan, because two-finger scroll is their pan gesture. There
 * is no default that suits both, so it is a preference — stored per browser,
 * never in the document.
 */
export type WheelMode = 'zoom' | 'pan'

const WHEEL_MODE_KEY = 'openframe.wheelMode'
const SNAP_KEY = 'openframe.snapToGrid'

/** One shared instance, so "no guides" never invalidates a selector. */
const NO_GUIDES: readonly AlignmentGuide[] = []

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
 * What the pointer is currently doing.
 *
 * `translate` holds a LIVE DELTA, not a position. Nothing is written to the
 * document while a drag is in flight — the renderer draws committed frame plus
 * delta, and one command is dispatched on pointer-up. That single rule is what
 * makes a 500-event drag one undo entry, one save and (later) one collaborative
 * update, and it is the reason this state lives here rather than in the board.
 */
export type DragState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'translate'
      /** A Set, not an array: every visible object tests membership on every drag frame. */
      readonly ids: ReadonlySet<ObjectId>
      readonly dx: number
      readonly dy: number
    }
  | { readonly kind: 'marquee'; readonly origin: Point; readonly current: Point }
  /**
   * Drawing a new object to size, the way every graphics tool creates a shape.
   *
   * Carries the type it will become so the preview can be drawn as that type
   * rather than as a generic rectangle, and so the commit needs nothing but
   * this state. Like every other gesture it writes NOTHING until pointer-up:
   * one command, one undo entry, however many frames the drag took.
   */
  | {
      readonly kind: 'draw'
      readonly objectType: string
      readonly data: Readonly<Record<string, unknown>> | undefined
      readonly origin: Point
      readonly current: Point
      /** Held Shift: a square, a circle, a frame with equal sides. */
      readonly constrained: boolean
    }
  | { readonly kind: 'pan' }
  /*
   * Resize and rotate carry PREVIEW FRAMES rather than writing to the document.
   * Same rule as dragging: the gesture is transient, and exactly one command is
   * dispatched when it commits.
   */
  | {
      readonly kind: 'resize'
      readonly handle: HandleId
      readonly frames: ReadonlyMap<ObjectId, ObjectFrame>
    }
  | { readonly kind: 'rotate'; readonly frames: ReadonlyMap<ObjectId, ObjectFrame> }
  /** Drawing a connector: one end fixed, the other following the pointer. */
  | {
      readonly kind: 'connect'
      readonly from: ConnectorEndpoint
      readonly to: Point
      /** The object currently under the pointer, highlighted as a drop target. */
      readonly over: ObjectId | null
    }

/**
 * TRANSIENT, CLIENT-ONLY state.
 *
 * Everything here is deliberately absent from the board document: it belongs to
 * this browser tab and this moment. When multiplayer arrives, a few of these
 * (selection, drag delta, viewport) are PROJECTED onto presence so others can
 * see them — but this store stays authoritative locally, and presence is never
 * read back into it.
 */
interface InteractionState {
  readonly tool: Tool
  /** Which shape the shape tool will draw. Cycled with `U`. */
  readonly shapeKind: ShapeKind
  readonly wheelMode: WheelMode
  /**
   * Whether transforms snap to the grid. On by default; held Cmd/Ctrl overrides
   * it for the duration of a gesture without changing the preference.
   */
  readonly snapToGrid: boolean
  /**
   * A transient message for something the user did that could not be done —
   * an unsupported file, say. Not an error channel: failures the user did not
   * cause belong in the notice banner, which persists.
   */
  readonly toast: string | null
  /**
   * Alignment guides for the gesture in flight. Empty between gestures, and
   * the SAME empty array each time — a fresh `[]` would fail `Object.is` and
   * re-render every subscriber on every pointer move (rule 9).
   */
  readonly guides: readonly AlignmentGuide[]
  readonly selection: ReadonlySet<ObjectId>
  readonly hoveredId: ObjectId | null
  readonly editingId: ObjectId | null
  readonly viewport: Viewport
  readonly drag: DragState
  /**
   * Size of the canvas element. Transient view state, but several things
   * outside the canvas need it — zoom-to-fit, centred zoom, the zoom slider —
   * and threading a ref through the tree for a number is worse than storing it.
   */
  readonly canvasSize: { readonly width: number; readonly height: number }
  /**
   * Copied objects, held in memory rather than the system clipboard.
   *
   * The system clipboard needs permission prompts and a serialization format
   * that other applications could interpret — worth doing, and not worth
   * blocking copy/paste on. Cross-tab paste is the deliberate gap.
   */
  readonly clipboard: readonly AnyOpenFrameObject[]
  /** Screen coordinates of the open context menu, or null. */
  readonly contextMenu: Point | null
  /**
   * Whether the search panel is open.
   *
   * Interaction state, not document state: what someone is looking for is not
   * part of the board, and a search open in one tab has nothing to say to
   * another person's.
   */
  readonly searchOpen: boolean

  setTool(tool: Tool): void
  /** Selects the shape tool, advancing the variant when it is already active. */
  cycleShape(): void
  setWheelMode(mode: WheelMode): void
  setSnapToGrid(enabled: boolean): void
  showToast(message: string | null): void
  setGuides(guides: readonly AlignmentGuide[]): void
  toggleSnapToGrid(): void
  toggleWheelMode(): void
  setSelection(ids: readonly ObjectId[]): void
  toggleSelection(id: ObjectId): void
  clearSelection(): void
  setHovered(id: ObjectId | null): void
  setEditing(id: ObjectId | null): void
  setViewport(viewport: Viewport): void
  setCanvasSize(width: number, height: number): void
  setClipboard(objects: readonly AnyOpenFrameObject[]): void
  openContextMenu(at: Point): void
  closeContextMenu(): void
  setSearchOpen(open: boolean): void
  beginTranslate(ids: readonly ObjectId[]): void
  updateTranslate(dx: number, dy: number): void
  beginMarquee(origin: Point): void
  /** Starts drawing a new object to size. Nothing is created until it commits. */
  beginDraw(
    objectType: string,
    at: Point,
    data: Readonly<Record<string, unknown>> | undefined,
  ): void
  updateDraw(current: Point, constrained: boolean): void
  updateMarquee(current: Point): void
  beginPan(): void
  beginResize(handle: HandleId): void
  beginRotate(): void
  beginConnect(from: ConnectorEndpoint, at: Point): void
  updateConnect(to: Point, over: ObjectId | null): void
  /** Replaces the live preview frames mid-gesture. */
  previewFrames(frames: ReadonlyMap<ObjectId, ObjectFrame>): void
  endDrag(): void
  /** Drops references to objects that no longer exist (after delete or undo). */
  pruneSelection(exists: (id: ObjectId) => boolean): void
}

export const useInteractionStore = create<InteractionState>((set) => ({
  tool: 'select',
  shapeKind: 'rectangle',
  wheelMode: readWheelMode(),
  snapToGrid: readSnap(),
  toast: null,
  guides: NO_GUIDES,
  selection: new Set<ObjectId>(),
  hoveredId: null,
  editingId: null,
  viewport: DEFAULT_VIEWPORT,
  drag: { kind: 'idle' },
  canvasSize: { width: 0, height: 0 },
  clipboard: [],
  contextMenu: null,
  searchOpen: false,

  setTool: (tool) => set({ tool, editingId: null }),

  cycleShape: () =>
    set((state) => {
      // First press picks the tool; further presses walk the variants, which is
      // how a single key can reach four shapes without four bindings.
      if (state.tool !== 'shape') return { tool: 'shape', editingId: null }
      const next = SHAPE_KINDS[(SHAPE_KINDS.indexOf(state.shapeKind) + 1) % SHAPE_KINDS.length]
      return { shapeKind: next ?? 'rectangle', editingId: null }
    }),

  setWheelMode: (wheelMode) => {
    writeWheelMode(wheelMode)
    set({ wheelMode })
  },

  showToast: (toast) => set({ toast }),

  setGuides: (guides) => set({ guides: guides.length === 0 ? NO_GUIDES : guides }),

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
  setSelection: (ids) => set({ selection: new Set(ids) }),
  toggleSelection: (id) =>
    set((state) => {
      const next = new Set(state.selection)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selection: next }
    }),
  clearSelection: () => set({ selection: new Set<ObjectId>() }),
  setHovered: (hoveredId) => set({ hoveredId }),
  setEditing: (editingId) => set({ editingId }),
  setViewport: (viewport) => set({ viewport }),

  setClipboard: (clipboard) => set({ clipboard: [...clipboard] }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),

  setCanvasSize: (width, height) =>
    set((state) =>
      state.canvasSize.width === width && state.canvasSize.height === height
        ? {}
        : { canvasSize: { width, height } },
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
  beginConnect: (from, at) => set({ drag: { kind: 'connect', from, to: at, over: null } }),
  updateConnect: (to, over) =>
    set((state) => (state.drag.kind === 'connect' ? { drag: { ...state.drag, to, over } } : {})),
  previewFrames: (frames) =>
    set((state) =>
      state.drag.kind === 'resize' || state.drag.kind === 'rotate'
        ? { drag: { ...state.drag, frames } }
        : {},
    ),
  endDrag: () => set({ drag: { kind: 'idle' }, guides: NO_GUIDES }),

  pruneSelection: (exists) =>
    set((state) => {
      const next = new Set<ObjectId>()
      for (const id of state.selection) if (exists(id)) next.add(id)
      return next.size === state.selection.size ? {} : { selection: next }
    }),
}))

/** Selector helper so components subscribe to one object's selected-ness. */
export const selectIsSelected =
  (id: ObjectId) =>
  (state: InteractionState): boolean =>
    state.selection.has(id)
