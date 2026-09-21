import { useMemo, useRef } from 'react'

import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import {
  HANDLES,
  HANDLE_CURSORS,
  HANDLE_HIT_PX,
  ROTATE_OFFSET_PX,
  handleAnchor,
} from '../scene/resize.js'
import { unionAll, type Rect } from '@openframe/core'
import { RotateIcon } from '../ui/icons.js'
import { fitToText } from '../scene/fit-text.js'
import { useCommands } from '../hooks/use-commands.js'

/** Handles stay this many SCREEN pixels across, whatever the zoom. */
/** The drawn handle: small on purpose, so it marks a corner without claiming it. */
const HANDLE_PX = 9
/** The rotate grip, which carries a drawn glyph rather than being a mark. */
const ROTATE_PX = 15
/** How close two presses must be to count as one gesture. Matches the divider. */
const DOUBLE_PRESS_MS = 400
/**
 * The handle for each axis, and the axis it fits.
 *
 * Only the two side handles. A corner resizes both axes at once and has no
 * single axis to fit, and fitting both from one press would move the object's
 * text sideways as well as down — two answers to a question that asked one.
 */
const FITS: Partial<Record<string, 'x' | 'y'>> = { e: 'x', s: 'y' }

/**
 * The selection box, resize handles and rotate grip.
 *
 * Drawn in world space so it tracks the objects exactly, but every dimension is
 * divided by zoom so the handles stay a constant, grabbable size on screen —
 * handles that shrink with the board are unusable at 25%.
 *
 * A single rotated object gets an ORIENTED box that turns with it; a
 * multi-selection gets the axis-aligned union, because there is no meaningful
 * shared orientation for a group.
 */
export function SelectionOverlay() {
  const { runtime } = useOpenFrame()
  const commands = useCommands()
  /*
   * The last press on a handle, for counting a double. A ref rather than
   * state, exactly as the divider overlay does it: nothing renders differently
   * because of it, and a re-render between the two presses would lose the
   * count.
   */
  const pressed = useRef<{ handle: string; at: number } | null>(null)
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const zoom = useInteractionStore((state) => state.viewport.zoom)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)
  const previewFrames = useInteractionStore((state) =>
    state.drag.kind === 'resize' || state.drag.kind === 'rotate' ? state.drag.frames : null,
  )

  const objects = useMemo(
    () =>
      [...selection]
        .map((id) => document.objects.get(id))
        .filter((object) => object !== undefined)
        .map((object) => {
          const preview = previewFrames?.get(object.id)
          return preview === undefined ? object : { ...object, frame: preview }
        }),
    [selection, document, previewFrames],
  )

  /*
   * Bounds come from the REGISTRY, not from `object.frame`.
   *
   * A connector has no meaningful frame — its extent is wherever its endpoints
   * resolve — so reading the frame drew a degenerate selection box at the
   * origin. Asking the registry is also what makes this correct for any future
   * type with computed bounds.
   */
  const bounds = useMemo<Rect | null>(
    () => unionAll(objects.map((object) => runtime.registry.boundsOf(object, document))),
    [objects, runtime.registry, document],
  )

  // Hidden while marquee-selecting or editing text: the box would sit on top of
  // the thing the user is currently working with.
  if (bounds === null || dragKind === 'marquee' || editingId !== null) return null

  /*
   * A single object with a real frame gets an ORIENTED box that turns with it.
   * Anything else — a multi-selection, or a type with no frame of its own —
   * gets the axis-aligned bounds, since there is no shared orientation to use.
   */
  const only = objects.length === 1 ? objects[0] : undefined
  const single =
    only !== undefined && only.frame.width > 0 && only.frame.height > 0 ? only : undefined
  const rotation = single?.frame.rotation ?? 0
  const box = single === undefined ? bounds : single.frame
  const rotatable =
    single !== undefined &&
    !single.locked &&
    runtime.registry.get(single.type)?.capabilities.rotatable === true
  /*
   * SOME, not every.
   *
   * Requiring every member to be resizable meant one connector in the selection
   * removed the handles entirely — select-all on a diagram offered no resize at
   * all. The gesture transforms only the resizable members; a connector follows
   * its endpoints without being touched.
   */
  const resizable =
    objects.length > 0 &&
    objects.every((object) => !object.locked) &&
    objects.some((object) => runtime.registry.get(object.type)?.capabilities.resizable === true)

  /**
   * Grows the object until its text fits, on ONE axis.
   *
   * The measurement is the DOM's — it depends on the face, the size and where
   * the text happens to break, none of which the document knows — and what
   * follows is an ordinary resize command, so it undoes in one step like any
   * other.
   *
   * Reads the object through `[data-object-id]` and its text through
   * `[data-fit-text]`, naming no type: any view that marks its text element
   * gets this, and a type with no text simply reports nothing to do.
   */
  const fit = (axis: 'x' | 'y'): void => {
    if (single === undefined) return
    const element = window.document.querySelector(`[data-object-id="${single.id}"]`)
    if (!(element instanceof HTMLElement)) return

    const fitted = fitToText(element, axis, single.frame)
    if (fitted === null) return

    commands.resizeObjects([
      {
        id: single.id,
        frame:
          axis === 'x' ? { ...single.frame, width: fitted } : { ...single.frame, height: fitted },
      },
    ])
  }

  const size = HANDLE_PX / zoom
  // Both counter-scaled: a target that shrinks with the board is unusable at
  // 25%, which is exactly where a user is most likely to be resizing.
  const hitPad = Math.max(0, (HANDLE_HIT_PX - HANDLE_PX) / 2) / zoom
  const half = size / 2
  // The rotate grip is a glyph, so it gets its own counter-scaled size.
  const glyph = ROTATE_PX / zoom
  const glyphPad = Math.max(0, (HANDLE_HIT_PX - ROTATE_PX) / 2) / zoom

  return (
    <div
      className="of-selection"
      data-testid="selection-overlay"
      style={{
        transform: `translate(${String(box.x)}px, ${String(box.y)}px) rotate(${String(rotation)}rad)`,
        width: `${String(box.width)}px`,
        height: `${String(box.height)}px`,
        // Border and outline also have to resist the world transform.
        outlineWidth: `${String(1.5 / zoom)}px`,
      }}
    >
      {resizable &&
        HANDLES.map((handle) => {
          const anchor = handleAnchor(handle)
          return (
            <div
              key={handle}
              className="of-handle"
              data-handle={handle}
              data-testid={`handle-${handle}`}
              /*
               * DOUBLE-PRESS FITS THE OBJECT TO ITS TEXT, on the axis this
               * handle already resizes.
               *
               * Counted here rather than taken from `dblclick`, which never
               * arrives: that event targets the nearest common ancestor of its
               * two clicks, and by the second press the handle has MOVED —
               * fitting is what moved it. The divider handles learned this the
               * same way.
               */
              onPointerDown={(event) => {
                const axis = FITS[handle]
                if (axis === undefined) return
                const now = event.timeStamp
                const last = pressed.current
                pressed.current = { handle, at: now }
                if (last !== null && last.handle === handle && now - last.at < DOUBLE_PRESS_MS) {
                  pressed.current = null
                  fit(axis)
                }
              }}
              style={{
                left: `${String(anchor.x * box.width - half)}px`,
                top: `${String(anchor.y * box.height - half)}px`,
                width: `${String(size)}px`,
                height: `${String(size)}px`,
                borderWidth: `${String(1 / zoom)}px`,
                borderRadius: `${String(2 / zoom)}px`,
                cursor: HANDLE_CURSORS[handle],
              }}
            >
              {/*
                * The target, as a real element: a transparent outline or a
                * box-shadow would look right and still not be clickable. It
                * bubbles to the handle above, which carries `data-handle`, so
                * the gesture reads the same attribute either way.
                */}
              <span
                className="of-handle__target"
                aria-hidden="true"
                style={{
                  inset: `${String(-hitPad)}px`,
                  cursor: HANDLE_CURSORS[handle],
                }}
              />
            </div>
          )
        })}

      {rotatable && (
        /*
         * Drawn LARGER than a resize handle, because it is a glyph rather than
         * a mark: a curved arrow rendered at 9px is an indistinct smudge, and
         * an indistinct smudge above the top edge is exactly the dot this
         * replaced.
         */
        <div
          className="of-handle of-handle--rotate"
          data-handle="rotate"
          data-testid="handle-rotate"
          style={{
            left: `${String(box.width / 2 - glyph / 2)}px`,
            top: `${String(-ROTATE_OFFSET_PX / zoom - glyph / 2)}px`,
            width: `${String(glyph)}px`,
            height: `${String(glyph)}px`,
          }}
        >
          <RotateIcon className="of-handle__glyph" />
          {/* The 24px pointer target (WCAG 2.5.8), same as every other handle:
              the drawn size is a design decision, the target is not. */}
          <span
            className="of-handle__target"
            aria-hidden="true"
            style={{ inset: `${String(-glyphPad)}px`, cursor: 'grab' }}
          />
        </div>
      )}
    </div>
  )
}
