import { useMemo, useRef } from 'react'

import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import {
  CORNER_HANDLES,
  HANDLES,
  HANDLE_CURSORS,
  EDGE_HANDLES,
  EDGE_HIT_PX,
  EDGE_INSET_PX,
  HANDLE_HIT_PX,
  ROTATE_OFFSET_PX,
  handleAnchor,
  isCompact,
} from '../scene/resize.js'
import { unionAll, worldRectToScreen, type Rect } from '@openframe/core'
import { LockIcon, RotateIcon } from '../controls/icons.js'
import { fitToText } from '../scene/fit-text.js'
import { useCommands } from '../hooks/use-commands.js'

/** Handles stay this many SCREEN pixels across, whatever the zoom. */
/** The drawn handle: small on purpose, so it marks a corner without claiming it. */
const HANDLE_PX = 9
/**
 * The drawn handle's border. A target is positioned inside its handle's
 * PADDING box, so it has to know how thick the border around that box is —
 * every target was a pixel short on each side, 22 where it said 24.
 */
const HANDLE_BORDER_PX = 1
/** The rotate grip, which carries a drawn glyph rather than being a mark. */
const ROTATE_PX = 15
/** The lock badge on a selection that cannot be moved. */
const LOCK_PX = 24
/** How far below the selection a size or angle readout hangs. */
const READOUT_GAP_PX = 14

/** Radians as degrees in (-180, 180], the way an angle is read. */
function degrees(radians: number): number {
  const d = (radians * 180) / Math.PI
  const wrapped = ((d % 360) + 360) % 360
  return wrapped > 180 ? wrapped - 360 : wrapped
}

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
  /*
   * A MOVE, previewed like the others. The box and its handles used to stay
   * where the selection WAS while the objects moved under the pointer — on
   * the most frequent gesture on the board, a detached frame that read as a
   * glitch. Primitives, so the selectors stay stable (rule 9).
   */
  const moveDx = useInteractionStore((state) =>
    state.drag.kind === 'translate' ? state.drag.dx : 0,
  )
  const moveDy = useInteractionStore((state) =>
    state.drag.kind === 'translate' ? state.drag.dy : 0,
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

  /*
   * A lone GROUP and how many it holds, asked of the capabilities rather than
   * the type (rule 18). Counted once per change of document or selection, not
   * per frame: the document does not change during a drag.
   */
  const group = useMemo<number | null>(() => {
    if (objects.length !== 1) return null
    const [only] = objects
    if (only === undefined) return null
    const capabilities = runtime.registry.get(only.type)?.capabilities
    if (capabilities?.selectsAsUnit !== true || capabilities.canHaveChildren !== true) return null
    let count = 0
    for (const object of document.objects.values()) if (object.parentId === only.id) count += 1
    return count
  }, [objects, runtime.registry, document])

  // Hidden while marquee-selecting or editing text: the box would sit on top of
  // the thing the user is currently working with.
  if (bounds === null || dragKind === 'marquee' || editingId !== null) return null

  /*
   * A LINE ON ITS OWN IS SELECTED BY ITS ENDS. A type whose shape is its ends
   * (rule 16) draws them as its apparatus, so a box around it as well was a
   * rectangle nobody could use — and one that went stale while the line was
   * reshaped. Asked of the registry, so nothing here names a connector.
   */
  const lone = objects.length === 1 ? objects[0] : undefined
  if (lone !== undefined && runtime.registry.endpointsOf(lone, document).length > 0) return null

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
  const resting = single === undefined ? bounds : single.frame
  const box =
    moveDx === 0 && moveDy === 0
      ? resting
      : { ...resting, x: resting.x + moveDx, y: resting.y + moveDy }
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
  /*
   * Members, as rectangles relative to the box. Only for a multi-selection,
   * and from the registry like the box itself, carried by the same move.
   */
  const members =
    objects.length > 1
      ? objects.map((object) => {
          const at = runtime.registry.boundsOf(object, document)
          const onScreen = worldRectToScreen(viewport, {
            ...at,
            x: at.x + moveDx,
            y: at.y + moveDy,
          })
          return {
            id: object.id,
            x: onScreen.x - screen.x,
            y: onScreen.y - screen.y,
            width: onScreen.width,
            height: onScreen.height,
          }
        })
      : []
  /*
   * What a resize or a turn is reaching for, beside it: a size in world units,
   * or an angle. Read off the same preview the box is drawn from.
   */
  const readout =
    dragKind === 'resize'
      ? `${String(Math.round(box.width))} × ${String(Math.round(box.height))}`
      : dragKind === 'rotate' && single !== undefined
        ? `${String(Math.round(degrees(rotation)))}°`
        : null
  const around = worldRectToScreen(viewport, {
    ...bounds,
    x: bounds.x + moveDx,
    y: bounds.y + moveDy,
  })
  const glyphPad = Math.max(0, (HANDLE_HIT_PX - ROTATE_PX) / 2)
  const compact = isCompact(screen)
  const handles = compact ? CORNER_HANDLES : HANDLES

  return (
    <>
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
           *
           * A BUTTON that unlocks. It explained the missing handles and could
           * not be pressed — `pointer-events: none`, so even its tip never
           * showed — and the only way out was the context menu. Its press is
           * stopped here so the board does not also read it as a gesture.
           */
          <button
            type="button"
            className="of-lock"
            data-testid="selection-lock"
            aria-label="Unlock"
            data-tip="Locked — press to unlock"
          aria-description="Locked — press to unlock"
            onPointerDown={(event) => {
              event.stopPropagation()
            }}
            onClick={() => {
              commands.setLocked(false)
            }}
            style={{
              left: `${String(-LOCK_PX)}px`,
              top: `${String(-LOCK_PX)}px`,
              width: `${String(LOCK_PX)}px`,
              height: `${String(LOCK_PX)}px`,
            }}
          >
            <LockIcon className="of-lock__glyph" />
          </button>
        )}

        {group !== null && (
          /*
           * A group, said. It was a bare box with no grips and no panel — a
           * selection that looked broken, which DESIGN.md names as exactly the
           * bug a badge prevents. Above the box, where the lock sits for a
           * locked one, and the same small mono as the record line.
           */
          <div className="of-selection__badge" data-testid="selection-group">
            Group of {String(group)}
          </div>
        )}

        {members.map((member) => (
          /*
           * Each member of a multi-selection, marked. Inside the union box they
           * looked exactly like the objects around them that were not selected.
           */
          <div
            key={member.id}
            className="of-selection__member"
            aria-hidden="true"
            style={{
              left: `${String(member.x)}px`,
              top: `${String(member.y)}px`,
              width: `${String(member.width)}px`,
              height: `${String(member.height)}px`,
            }}
          />
        ))}

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
          !compact &&
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
          handles.map((handle) => {
            const anchor = handleAnchor(handle)
            /*
             * Centred on its corner, or — on a compact selection — sitting just
             * OUTSIDE it, so the object's face is left entirely to the object.
             */
            const drawn = {
              left: compact
                ? anchor.x === 0
                  ? -HANDLE_PX
                  : screen.width
                : anchor.x * screen.width - half,
              top: compact
                ? anchor.y === 0
                  ? -HANDLE_PX
                  : screen.height
                : anchor.y * screen.height - half,
            }
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
                  left: `${String(drawn.left)}px`,
                  top: `${String(drawn.top)}px`,
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
                    ...outwardReach(anchor, drawn, screen),
                    cursor: HANDLE_CURSORS[handle],
                  }}
                />
              </div>
            )
          })}

        {rotatable && !compact && (
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
      {readout !== null && (
        /*
         * Not on the turning box: text that turned with the object would be
         * read at an angle. It hangs below the selection's upright bounds.
         */
        <div
          className="of-selection__readout"
          data-testid="selection-readout"
          style={{
            left: `${String(around.x + around.width / 2)}px`,
            top: `${String(around.y + around.height + READOUT_GAP_PX)}px`,
          }}
        >
          {readout}
        </div>
      )}
    </>
  )
}

/**
 * Where a handle's pointer target lies, as insets from its padding box.
 *
 * On an axis the handle is at an END of, the whole target is outside the
 * selection: it runs `HANDLE_HIT_PX` outward from the boundary and stops
 * there. On an axis where it sits at the MIDDLE it spreads evenly, because
 * that is along the edge rather than into the object.
 *
 * Worked out as the rectangle the target SHOULD cover, then subtracted from
 * the box it is positioned in — the handle's padding box, inside its border.
 * The border is what the first version forgot, and every target came out a
 * pixel short on each side.
 *
 * Returned as four insets rather than one, which is the only way to say
 * "24 across, but not there".
 */
function outwardReach(
  anchor: { x: number; y: number },
  drawn: { left: number; top: number },
  screen: { width: number; height: number },
): { left: number; right: number; top: number; bottom: number } {
  const axis = (at: number, start: number, extent: number): [number, number] => {
    const edge = at * extent
    const [from, to] =
      at === 0
        ? [edge - HANDLE_HIT_PX, edge]
        : at === 1
          ? [edge, edge + HANDLE_HIT_PX]
          : [edge - HANDLE_HIT_PX / 2, edge + HANDLE_HIT_PX / 2]
    const inner = start + HANDLE_BORDER_PX
    const outer = start + HANDLE_PX - HANDLE_BORDER_PX
    return [from - inner, outer - to]
  }
  const [left, right] = axis(anchor.x, drawn.left, screen.width)
  const [top, bottom] = axis(anchor.y, drawn.top, screen.height)
  return { left, right, top, bottom }
}
