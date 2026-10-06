import type { BoardDocument, ObjectId } from '@openframe/core'

/**
 * Pointer events originating in a text control, or in the chrome that drives
 * one, belong to that control.
 *
 * The format bar counts. It lives INSIDE the canvas, beside the editor it acts
 * on, so without this a press on "bold" reads as a canvas gesture: the handler
 * below blurs the active element, the editor commits and unmounts, and the mark
 * is then applied to a selection that no longer exists. The symptom is a button
 * that silently does nothing while the same action from the keyboard works.
 */
/**
 * Chrome that belongs to an OPEN EDITOR, marked with one class rather than
 * listed here by name.
 *
 * The same bug has now been found three times: the format bar, a table's add
 * and remove buttons, and a code block's language menu. Each time, pressing
 * the control read as a canvas gesture — the handler below ends the edit, the
 * editor commits and unmounts, and the press lands on nothing. The symptom is
 * a control that silently does nothing.
 *
 * The marker goes on the EDITOR, not on each control, so the next thing added
 * inside one is covered without anybody remembering to do it. That is the
 * difference between a rule and a list of the places it was applied.
 */
export const EDITOR_CHROME = '.of-editor-chrome'

/**
 * Which of these are locked, asked of the document once.
 *
 * Takes the candidates rather than scanning: a press only ever concerns the
 * object under the pointer and the current selection, and asking about the
 * whole board would put an O(n) walk on every pointerdown.
 */
export function lockedAmong(
  doc: BoardDocument,
  candidates: readonly (ObjectId | null)[],
): ReadonlySet<ObjectId> {
  const locked = new Set<ObjectId>()
  for (const id of candidates) {
    if (id === null) continue
    if (doc.objects.get(id)?.locked === true) locked.add(id)
  }
  return locked
}

export function isTextEntry(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) return true
  if (target instanceof HTMLElement && target.isContentEditable) return true
  /*
   * `Element`, NOT `HTMLElement`.
   *
   * A control whose face is a drawn icon puts an `SVGElement` under the
   * pointer, and an SVGElement is not an HTMLElement — so the chrome check
   * never ran for it, the canvas read the press as a board gesture, and the
   * selection was cleared. The apparatus then unmounted between `pointerdown`
   * and `click`, which means the click event never fired at all: a button that
   * looks fine, highlights on hover, and does nothing.
   *
   * The fifth appearance of this family of fault, and the first one where the
   * marker was present and correct — it was the type test that let the press
   * through.
   */
  return target instanceof Element && target.closest(EDITOR_CHROME) !== null
}

/** Reads the handle under the pointer, if the gesture began on one. */
export function handleUnderPointer(target: EventTarget | null): string | null {
  if (!(target instanceof HTMLElement)) return null
  return target.closest<HTMLElement>('[data-handle]')?.dataset.handle ?? null
}

/**
 * The handle at a point on screen, if any.
 *
 * `handleUnderPointer` reads the event's target, which is right for a press —
 * a `pointerdown` is addressed to exactly what it landed on. A `dblclick` is
 * not: it targets the nearest common ancestor of its two clicks, so one that
 * begins on a handle and ends on what is beneath arrives addressed to the
 * canvas, and the handle is invisible to it.
 */
export function handleAt(clientX: number, clientY: number): string | null {
  if (typeof window === 'undefined') return null
  return handleUnderPointer(window.document.elementFromPoint(clientX, clientY))
}

/**
 * Whether a handle claims the DOUBLE-click as well as the drag.
 *
 * A table's divider does: double-clicking it fits the column to its content,
 * and the object underneath must not also open its editor on top of that.
 *
 * An endpoint handle does not. It is a drag target and nothing else — and a
 * connector's midpoint handle sits exactly where somebody double-clicks to
 * label the line, so treating it as in the way made a connector's label
 * unreachable the moment stops were added.
 */
export function claimsDoubleClick(handle: string | null): boolean {
  return handle !== null && handle !== 'endpoint'
}

/**
 * The object whose rendered chrome was pressed, for chrome that sits OUTSIDE
 * the object's world bounds.
 *
 * A frame's title is drawn above the frame and counter-scaled to stay a
 * constant size on screen, so it has no fixed world geometry and world-space
 * hit testing cannot see it — clicking it would deselect instead of selecting.
 * Rather than special-casing frames in the geometry, the DOM answers for the
 * cases only the DOM knows about.
 */
export function objectChromeUnderPointer(target: EventTarget | null): ObjectId | null {
  if (!(target instanceof HTMLElement)) return null
  const id = target.closest<HTMLElement>('[data-object-id]')?.dataset.objectId
  return id === undefined ? null : (id as ObjectId)
}

/**
 * The chrome of a HOLLOW object under the pointer — a frame's title — which
 * wins over whatever the board's geometry finds there.
 *
 * A hollow object can only be reached through its chrome, so asking geometry
 * first would let a note that happens to lie under a frame's title take the
 * press, and the frame could then be neither selected, moved, renamed nor
 * given its menu. Any other object's element is left to geometry, which is
 * what resolves a member of a group to its group.
 */
export function hollowChromeUnderPointer(
  targets: readonly (EventTarget | null)[],
  isHollow: (id: ObjectId) => boolean,
): ObjectId | null {
  for (const target of targets) {
    const id = objectChromeUnderPointer(target)
    if (id !== null && isHollow(id)) return id
  }
  return null
}
