import { DEFAULT_VIEWPORT, type ObjectId, type Point, type Viewport } from '@openframe/core'
import { create } from 'zustand'

export type Tool = 'select' | 'sticky' | 'pan'

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
  | { readonly kind: 'pan' }

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
  readonly selection: ReadonlySet<ObjectId>
  readonly hoveredId: ObjectId | null
  readonly editingId: ObjectId | null
  readonly viewport: Viewport
  readonly drag: DragState

  setTool(tool: Tool): void
  setSelection(ids: readonly ObjectId[]): void
  toggleSelection(id: ObjectId): void
  clearSelection(): void
  setHovered(id: ObjectId | null): void
  setEditing(id: ObjectId | null): void
  setViewport(viewport: Viewport): void
  beginTranslate(ids: readonly ObjectId[]): void
  updateTranslate(dx: number, dy: number): void
  beginMarquee(origin: Point): void
  updateMarquee(current: Point): void
  beginPan(): void
  endDrag(): void
  /** Drops references to objects that no longer exist (after delete or undo). */
  pruneSelection(exists: (id: ObjectId) => boolean): void
}

export const useInteractionStore = create<InteractionState>((set) => ({
  tool: 'select',
  selection: new Set<ObjectId>(),
  hoveredId: null,
  editingId: null,
  viewport: DEFAULT_VIEWPORT,
  drag: { kind: 'idle' },

  setTool: (tool) => set({ tool, editingId: null }),
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

  beginTranslate: (ids) => set({ drag: { kind: 'translate', ids: new Set(ids), dx: 0, dy: 0 } }),
  updateTranslate: (dx, dy) =>
    set((state) => (state.drag.kind === 'translate' ? { drag: { ...state.drag, dx, dy } } : {})),
  beginMarquee: (origin) => set({ drag: { kind: 'marquee', origin, current: origin } }),
  updateMarquee: (current) =>
    set((state) => (state.drag.kind === 'marquee' ? { drag: { ...state.drag, current } } : {})),
  beginPan: () => set({ drag: { kind: 'pan' } }),
  endDrag: () => set({ drag: { kind: 'idle' } }),

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
