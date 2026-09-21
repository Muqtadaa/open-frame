import { cropByHandle, FULL_CROP, type ImageCrop, type ObjectFrame } from '@openframe/core'

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
  const zoom = useInteractionStore((state) => state.viewport.zoom)
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

  const corner = CORNER_PX / zoom
  const thick = CORNER_THICK_PX / zoom
  const edge = EDGE_PX / zoom
  // The 24px pointer target (WCAG 2.5.8), as for every other handle: the drawn
  // size is a design decision and the target is not.
  const pad = Math.max(0, HANDLE_HIT_PX / zoom - thick) / 2

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
        transform: `translate(${String(frame.x)}px, ${String(frame.y)}px)`,
        width: `${String(frame.width)}px`,
        height: `${String(frame.height)}px`,
        outlineWidth: `${String(1.5 / zoom)}px`,
      }}
    >
      {HANDLES.map((handle) => {
        const anchor = handleAnchor(handle)
        const isCorner = handle.length === 2
        /*
         * A bracket is drawn with BORDERS on the two sides it owns, so the
         * corner piece is an L and an edge piece is a bar. Sized in world
         * units divided by the zoom, like every other piece of chrome, so it
         * stays a constant size on screen.
         */
        const across = isCorner ? corner : handle === 'n' || handle === 's' ? edge : thick
        const down = isCorner ? corner : handle === 'e' || handle === 'w' ? edge : thick

        return (
          <div
            key={handle}
            className={`of-crop__grip of-crop__grip--${handle}`}
            // Read back by the gesture, which does not otherwise know what was
            // grabbed — the same handshake the resize and divider grips use.
            data-handle="crop"
            data-crop-handle={handle}
            data-testid={`crop-${handle}`}
            style={{
              left: `${String(anchor.x * frame.width - across / 2)}px`,
              top: `${String(anchor.y * frame.height - down / 2)}px`,
              width: `${String(across)}px`,
              height: `${String(down)}px`,
              borderWidth: `${String(thick)}px`,
              cursor: HANDLE_CURSORS[handle],
            }}
          >
            <span
              className="of-handle__target"
              aria-hidden="true"
              style={{ inset: `${String(-pad)}px`, cursor: HANDLE_CURSORS[handle] }}
            />
          </div>
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
