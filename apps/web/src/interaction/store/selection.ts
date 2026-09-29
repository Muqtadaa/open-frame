import type { ObjectId } from '@openframe/core'

import type { SelectionSlice, Slice } from './state.js'

/** One shared empty set: a fresh `Set` fails `Object.is` (rule 9). */
const NO_LOCKS: ReadonlySet<ObjectId> = new Set<ObjectId>()

/**
 * Crop mode belongs to the object that is SELECTED, and only when it is the
 * only one.
 *
 * Nothing used to clear `croppingId`, and that single omission produced three
 * separate symptoms: the dashed outline and its reset button stayed on the
 * image you had left, the crop grips stayed in the DOM at `z-index: 3` — which
 * is above a selected object — and because those grips sit on exactly the same
 * corners as the resize handles, every later attempt to resize that image
 * cropped it instead.
 *
 * Expressed once here rather than remembered at each of the three call sites,
 * because a rule that has to be remembered three times is a rule that will be
 * forgotten once.
 */
function croppingWithin(
  croppingId: ObjectId | null,
  selection: ReadonlySet<ObjectId>,
): ObjectId | null {
  if (croppingId === null) return null
  return selection.size === 1 && selection.has(croppingId) ? croppingId : null
}

/**
 * What is selected, hovered, pointed at, being edited or cropped — and what somebody else holds.
 */
export const selectionSlice: Slice<SelectionSlice> = (set, get) => ({
  selection: new Set<ObjectId>(),
  hoveredId: null,
  pointerWorld: null,
  editingId: null,
  croppingId: null,
  editingAt: null,
  lockedByOthers: NO_LOCKS,
  setSelection: (ids) =>
    set((state) => {
      const selection = new Set(ids)
      return { selection, croppingId: croppingWithin(state.croppingId, selection) }
    }),
  toggleSelection: (id) =>
    set((state) => {
      const next = new Set(state.selection)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selection: next, croppingId: croppingWithin(state.croppingId, next) }
    }),
  clearSelection: () => set({ selection: new Set<ObjectId>(), croppingId: null }),
  /*
   * Both run on every pointer move, and every write re-runs every
   * subscriber's selector — about twenty per visible object. A move that
   * changes nothing writes nothing (audit 2026-09-27).
   */
  setHovered: (hoveredId) => {
    if (get().hoveredId !== hoveredId) set({ hoveredId })
  },
  setPointer: (pointerWorld) => {
    const was = get().pointerWorld
    const same =
      was === pointerWorld ||
      (was !== null &&
        pointerWorld !== null &&
        was.x === pointerWorld.x &&
        was.y === pointerWorld.y)
    if (!same) set({ pointerWorld })
  },
  setEditing: (editingId, at) =>
    set((state) => {
      // Refused, not queued. Somebody else has the note open, and the right
      // outcome is that nothing happens and the overlay says who has it.
      if (editingId !== null && state.lockedByOthers.has(editingId)) return {}
      // Cleared whenever editing ends or starts without a point, so a stale
      // one from the last edit cannot decide where this one begins.
      return { editingId, editingAt: editingId === null ? null : (at ?? null) }
    }),

  setLockedByOthers: (lockedByOthers) =>
    set((state) => {
      // Somebody else got there first while this client was already typing.
      // They keep it; this editor closes rather than both people writing into
      // one note and watching each other's words vanish.
      const editingId =
        state.editingId !== null && lockedByOthers.has(state.editingId) ? null : state.editingId
      return { lockedByOthers, editingId }
    }),
  setCropping: (croppingId) =>
    // Cropping and editing are exclusive: entering one leaves the other.
    set({ croppingId, ...(croppingId === null ? {} : { editingId: null }) }),

  pruneSelection: (exists) =>
    set((state) => {
      const next = new Set<ObjectId>()
      for (const id of state.selection) if (exists(id)) next.add(id)
      return next.size === state.selection.size ? {} : { selection: next }
    }),
})
