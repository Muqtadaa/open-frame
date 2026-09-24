import { useMemo, useRef } from 'react'

import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import {
  HANDLES,
  HANDLE_CURSORS,
  EDGE_HANDLES,
  EDGE_HIT_PX,
  EDGE_INSET_PX,
  HANDLE_HIT_PX,
  ROTATE_OFFSET_PX,
  handleAnchor,
} from '../scene/resize.js'
import { unionAll, worldRectToScreen, type Rect } from '@openframe/core'
import { LockIcon, RotateIcon } from '../ui/icons.js'
import { fitToText } from '../scene/fit-text.js'
import { useCommands } from '../hooks/use-commands.js'

/** Handles stay this many SCREEN pixels across, whatever the zoom. */
/** The drawn handle: small on purpose, so it marks a corner without claiming it. */
const HANDLE_PX = 9
/** The rotate grip, which carries a drawn glyph rather than being a mark. */
const ROTATE_PX = 15
/** The lock badge on a selection that cannot be moved. */
const LOCK_PX = 18
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
 * Drawn on the APPARATUS LAYER, in screen pixels. The box is the selection's
 * world bounds converted once; everything on it is a plain constant, because a
 * handle is 9px at 5% and at 1600% alike.
 *
 * It used to be drawn inside the world transform with every length divided by
 * the zoom, which works down to one pixel and then fails — see `.of-apparatus`
 * in styles.css for exactly how, and what it looked like.
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
  const viewport = useInteractionStore((state) => state.viewport)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)
  const croppingId = useInteractionStore((state) => state.croppingId)
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
  /*
   * CROP MODE REPLACES THE GRIPS, it does not add to them.
   *
   * The crop grips sit on exactly the same corners and edges, above the object
   * at `z-index: 3` — so with both on screen every press meant for a resize
   * hit a crop instead, and the image could not be resized at all. Two
   * gestures cannot offer a handle in the same place and expect the user to
   * know which one they got.
   */
  const cropping = croppingId !== null && croppingId === single?.id

  const rotation = single?.frame.rotation ?? 0
  const box = single === undefined ? bounds : single.frame
  const rotatable =
    !cropping &&
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
  /*
   * Every member held in place. A lock is the reason the handles are gone, and
   * without saying so the selection just looks broken — the box is there, the
   * grips are not, and nothing explains why.
   */
  const locked = objects.length > 0 && objects.every((object) => object.locked)

  const resizable =
    !cropping &&
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

  /*
   * The one conversion. Everything below is a screen measurement, including
   * the box: a rotation survives it because the world transform is a uniform
   * scale, so an angle in world space is the same angle on screen.
   */
  const screen = worldRectToScreen(viewport, box)
  const half = HANDLE_PX / 2
  const glyphPad = Math.max(0, (HANDLE_HIT_PX - ROTATE_PX) / 2)

  return (
    <div
      className="of-selection"
      data-testid="selection-overlay"
      style={{
        transform: `translate(${String(screen.x)}px, ${String(screen.y)}px) rotate(${String(rotation)}rad)`,
        width: `${String(screen.width)}px`,
        height: `${String(screen.height)}px`,
      }}
    >
      {locked && (
        /*
         * Outside the box, above its top-left corner — a badge that grew with
         * the board would swallow a small object at 400%.
         */
        <div
          className="of-lock"
          data-testid="selection-lock"
          aria-label="Locked"
          title="Locked — unlock it to move or resize it"
          style={{
            left: `${String(-LOCK_PX)}px`,
            top: `${String(-LOCK_PX)}px`,
            width: `${String(LOCK_PX)}px`,
            height: `${String(LOCK_PX)}px`,
          }}
        >
          <LockIcon className="of-lock__glyph" />
        </div>
      )}

      {/*
       * THE EDGES, before the squares so a corner is always painted over a
       * strip it overlaps — and inset from them so it never comes to that.
       *
       * A selection's boundary is the obvious place to pull from, and only
       * the square at the middle of each edge used to answer. On a long edge
       * that is one target in nine hundred pixels of the thing that looks
       * like the target.
       */}
      {resizable &&
        EDGE_HANDLES.map((handle) => {
          const thick = EDGE_HIT_PX
          const inset = EDGE_INSET_PX
          const across = handle === 'n' || handle === 's'
          const length = (across ? screen.width : screen.height) - inset * 2
          // Too short to be worth a strip: the corners already cover it, and
          // a negative length would draw a target outside the selection.
          if (length <= 0) return null
          return (
            <div
              key={`edge-${handle}`}
              className="of-edge"
              data-handle={handle}
              data-testid={`edge-${handle}`}
              aria-hidden="true"
              style={{
                left: `${String(across ? inset : (handle === 'e' ? screen.width : 0) - thick / 2)}px`,
                top: `${String(across ? (handle === 's' ? screen.height : 0) - thick / 2 : inset)}px`,
                width: `${String(across ? length : thick)}px`,
                height: `${String(across ? thick : length)}px`,
                cursor: HANDLE_CURSORS[handle],
              }}
            />
          )
        })}

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
                left: `${String(anchor.x * screen.width - half)}px`,
                top: `${String(anchor.y * screen.height - half)}px`,
                width: `${String(HANDLE_PX)}px`,
                height: `${String(HANDLE_PX)}px`,
                cursor: HANDLE_CURSORS[handle],
              }}
            >
              {/*
               * The target, as a real element: a transparent outline or a
               * box-shadow would look right and still not be clickable. It
               * bubbles to the handle above, which carries `data-handle`, so
               * the gesture reads the same attribute either way.
               *
               * It reaches OUTWARD, and stops at the selection's edge. A
               * target centred on the corner puts half of itself over the
               * object, and on a small one the four of them meet in the
               * middle: the object can then only be resized, never picked up.
               * It did not show while the apparatus was inside the world,
               * because a selected object is lifted to `z-index: 1` and so
               * sat over its own handles — the inner halves were dead and
               * nobody noticed. On its own layer nothing is over it any more,
               * and a click in the middle of a small picture began a resize.
               *
               * So the whole 24 is spent outside, where there is nothing else
               * to press. The object's face keeps its interior, and the
               * target is the size it has to be.
               *
               * The edge STRIPS still straddle the boundary, which is not an
               * inconsistency: a strip is the tolerance band along an edge
               * that makes it grabbable at all, and four of them cannot meet
               * in the middle of anything.
               */}
              <span
                className="of-handle__target"
                aria-hidden="true"
                style={{
                  ...outwardReach(anchor, half),
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
            left: `${String(screen.width / 2 - ROTATE_PX / 2)}px`,
            top: `${String(-ROTATE_OFFSET_PX - ROTATE_PX / 2)}px`,
            width: `${String(ROTATE_PX)}px`,
            height: `${String(ROTATE_PX)}px`,
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

/**
 * Where a handle's pointer target lies, given the corner it sits on.
 *
 * On an axis the handle is at an END of, the whole target is outside the
 * selection: it runs `HANDLE_HIT_PX` outward from the boundary and stops
 * there, which is why the inner side is pulled back by the handle's own half.
 * On an axis where it sits at the MIDDLE it spreads evenly, because that is
 * along the edge rather than into the object.
 *
 * Returned as four insets rather than one, which is the only way to say
 * "24 across, but not there".
 */
function outwardReach(
  anchor: { x: number; y: number },
  half: number,
): { left: number; right: number; top: number; bottom: number } {
  const outward = HANDLE_HIT_PX - half
  const even = (HANDLE_HIT_PX - half * 2) / 2
  const spread = (at: number): [number, number] =>
    at === 0 ? [-outward, half] : at === 1 ? [half, -outward] : [-even, -even]
  const [left, right] = spread(anchor.x)
  const [top, bottom] = spread(anchor.y)
  return { left, right, top, bottom }
}
