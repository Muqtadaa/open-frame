import { Fragment } from 'react'

import {
  cropByHandle,
  FULL_CROP,
  worldRectToScreen,
  type ImageCrop,
  type ObjectFrame,
} from '@openframe/core'

import { useCommands } from '../hooks/use-commands.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { ChromeSurface } from './EditorChrome.js'
import { optionsPanelRect } from './options-panel.js'
import { HANDLES, HANDLE_CURSORS, HANDLE_HIT_PX, handleAnchor } from '../scene/resize.js'

/**
 * A crop grip is a BRACKET, not a square.
 *
 * Squares are what a resize handle looks like, and the two gestures do
 * different things to the same object — one changes how big the picture is
 * drawn, the other how much of it there is. Corner brackets and edge bars are
 * the shape every tool with a crop uses, and the reason is that they draw the
 * EDGE you are about to move rather than a point.
 */
const CORNER_PX = 20
const CORNER_THICK_PX = 3
const EDGE_PX = 22

/**
 * Trimming an image, entered by double-clicking it.
 *
 * A SEPARATE overlay from the resize handles, on the same corners, because the
 * two gestures answer different questions: resize changes how big the picture
 * is drawn, crop changes how much of it there is. Sharing one set of grips
 * would mean a modifier key deciding which you meant, and a modifier is the
 * thing nobody discovers.
 *
 * Which objects can be cropped comes from the REGISTRY — a type declares a
 * crop window or it does not — so this names no type and the next type that
 * shows less than it holds gets handles by saying so.
 */
export function CropOverlay() {
  const { runtime } = useOpenFrame()
  const commands = useCommands()
  const document = useBoardDocument()
  const croppingId = useInteractionStore((state) => state.croppingId)
  const viewport = useInteractionStore((state) => state.viewport)
  /*
   * Primitives, not the objects: rule 9. A selector building a fresh frame
   * never compares equal and re-renders for ever.
   */
  const previewX = useInteractionStore((state) =>
    state.drag.kind === 'crop' ? (state.drag.frame?.x ?? null) : null,
  )
  const previewY = useInteractionStore((state) =>
    state.drag.kind === 'crop' ? (state.drag.frame?.y ?? null) : null,
  )
  const previewWidth = useInteractionStore((state) =>
    state.drag.kind === 'crop' ? (state.drag.frame?.width ?? null) : null,
  )
  const previewHeight = useInteractionStore((state) =>
    state.drag.kind === 'crop' ? (state.drag.frame?.height ?? null) : null,
  )

  if (croppingId === null) return null
  const object = document.objects.get(croppingId)
  if (object === undefined || object.locked) return null

  const window = runtime.registry.cropWindowOf(object)
  // A type that does not crop has no handles here, and never learned why.
  if (window === null) return null

  const frame: ObjectFrame =
    previewX === null || previewY === null || previewWidth === null || previewHeight === null
      ? object.frame
      : { ...object.frame, x: previewX, y: previewY, width: previewWidth, height: previewHeight }

  /*
   * The picture ON SCREEN. The brackets are drawn on the apparatus layer, so
   * every measurement below is a screen pixel and none of it is divided by the
   * zoom — a 3px bracket inside the world transform was 48 at 1600%.
   *
   * `frame` stays in world units for `ChromeSurface`, which takes a world
   * rectangle and does its own conversion.
   */
  const screen = worldRectToScreen(viewport, frame)
  const corner = CORNER_PX
  const thick = CORNER_THICK_PX
  const edge = EDGE_PX

  const crop: ImageCrop = (object.data as { crop?: ImageCrop | null }).crop ?? FULL_CROP
  const trimmed = crop.x > 0 || crop.y > 0 || crop.width < 1 || crop.height < 1

  return (
    <>
      {trimmed && (
        /*
         * ON THE CHROME LAYER, not beside the grips in world space.
         *
         * It was an ordinary button inside this overlay, and it did nothing at
         * all: the press was not marked as apparatus, so the canvas read it as
         * a board gesture and cleared the selection — which ends crop mode,
         * which unmounts the button between `pointerdown` and `click`. The
         * click event never fired. That is the FIFTH time this exact fault has
         * appeared, and the layer exists precisely so that a control does not
         * have to remember the marker.
         *
         * A grip is different and stays here: the canvas gesture reads
         * `data-handle` off it, so marking a grip as apparatus would stop the
         * crop drag from ever starting.
         */
        <ChromeSurface
          bounds={frame}
          prefer={['below', 'above']}
          avoid={optionsPanelRect()}
          testId="crop-apparatus"
        >
          <button
            type="button"
            className="of-crop__reset of-surface"
            data-testid="crop-reset"
            onClick={() => {
              commands.uncropImage(croppingId)
            }}
          >
            reset crop
          </button>
        </ChromeSurface>
      )}

      <div
        className="of-crop"
        data-testid="crop-overlay"
        style={{
          transform: `translate(${String(screen.x)}px, ${String(screen.y)}px)`,
          width: `${String(screen.width)}px`,
          height: `${String(screen.height)}px`,
        }}
      >
        {HANDLES.map((handle) => {
          const anchor = handleAnchor(handle)
          const isCorner = handle.length === 2
          /*
           * A bracket is drawn with BORDERS on the two sides it owns, so the
           * corner piece is an L and an edge piece is a bar — and every piece
           * lies just OUTSIDE the picture, hugging its edge. The corners used
           * to be centred on the corner while the edge bars sat on the edge,
           * two different ideas of where the crop line is.
           */
          const across = isCorner ? corner : handle === 'n' || handle === 's' ? edge : thick
          const down = isCorner ? corner : handle === 'e' || handle === 'w' ? edge : thick
          const place = (at: number, extent: number, size: number): number =>
            at === 0 ? -thick : at === 1 ? extent + thick - size : extent / 2 - size / 2
          const left = place(anchor.x, screen.width, across)
          const top = place(anchor.y, screen.height, down)
          /*
           * The 24px target, spent OUTSIDE the picture like a resize handle's
           * (WCAG 2.5.8). Centred on the bracket it reached up to 21px in,
           * which is exactly where somebody presses to slide the picture
           * under the window. Along an edge it spreads evenly.
           */
          const reach = (at: number, extent: number): [number, number] =>
            at === 0
              ? [-HANDLE_HIT_PX, 0]
              : at === 1
                ? [extent, extent + HANDLE_HIT_PX]
                : [extent / 2 - HANDLE_HIT_PX / 2, extent / 2 + HANDLE_HIT_PX / 2]
          const [targetLeft, targetRight] = reach(anchor.x, screen.width)
          const [targetTop, targetBottom] = reach(anchor.y, screen.height)

          return (
            <Fragment key={handle}>
              <div
                className={`of-crop__grip of-crop__grip--${handle}`}
                aria-hidden="true"
                style={{
                  left: `${String(left)}px`,
                  top: `${String(top)}px`,
                  width: `${String(across)}px`,
                  height: `${String(down)}px`,
                  borderWidth: `${String(thick)}px`,
                }}
              />
              {/*
               * The target is its own element beside the bracket rather than
               * inside it, so it can be exactly where it should be rather than
               * inset from a box with borders on two of its sides. It carries
               * the handshake the gesture reads.
               */}
              <span
                className="of-crop__target"
                data-handle="crop"
                data-crop-handle={handle}
                data-testid={`crop-${handle}`}
                style={{
                  left: `${String(targetLeft)}px`,
                  top: `${String(targetTop)}px`,
                  width: `${String(targetRight - targetLeft)}px`,
                  height: `${String(targetBottom - targetTop)}px`,
                  cursor: HANDLE_CURSORS[handle],
                }}
              />
            </Fragment>
          )
        })}
      </div>
    </>
  )
}

/** What a crop drag produces, given where it started and how far it has gone. */
export function croppedBy(
  frame: ObjectFrame,
  crop: ImageCrop,
  handle: string,
  dx: number,
  dy: number,
): { frame: ObjectFrame; crop: ImageCrop } | null {
  if (!HANDLES.includes(handle as (typeof HANDLES)[number])) return null
  const result = cropByHandle(frame, crop, handle as (typeof HANDLES)[number], dx, dy)
  return { frame: { ...frame, ...result.frame }, crop: result.crop }
}
