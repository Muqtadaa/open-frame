import { cropByHandle, FULL_CROP, type ImageCrop, type ObjectFrame } from '@openframe/core'

import { useCommands } from '../hooks/use-commands.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { HANDLES, HANDLE_CURSORS, HANDLE_HIT_PX, handleAnchor } from '../scene/resize.js'

/** The drawn handle, matching the resize grips so the gesture reads the same. */
const HANDLE_PX = 9

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

  const size = HANDLE_PX / zoom
  const hitPad = Math.max(0, (HANDLE_HIT_PX - HANDLE_PX) / 2) / zoom
  const half = size / 2

  const crop: ImageCrop = (object.data as { crop?: ImageCrop | null }).crop ?? FULL_CROP
  const trimmed = crop.x > 0 || crop.y > 0 || crop.width < 1 || crop.height < 1

  return (
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
        return (
          <div
            key={handle}
            className="of-crop__grip"
            // Read back by the gesture, which does not otherwise know what was
            // grabbed — the same handshake the resize and divider grips use.
            data-handle="crop"
            data-crop-handle={handle}
            data-testid={`crop-${handle}`}
            style={{
              left: `${String(anchor.x * frame.width - half)}px`,
              top: `${String(anchor.y * frame.height - half)}px`,
              width: `${String(size)}px`,
              height: `${String(size)}px`,
              borderWidth: `${String(1 / zoom)}px`,
              cursor: HANDLE_CURSORS[handle],
            }}
          >
            <span
              className="of-handle__target"
              aria-hidden="true"
              style={{ inset: `${String(-hitPad)}px`, cursor: HANDLE_CURSORS[handle] }}
            />
          </div>
        )
      })}

      {trimmed && (
        /*
         * Putting it back is not "set the window to full": the frame shrank
         * with the crop, so restoring one without the other squeezes the whole
         * picture into the trimmed box. `uncrop` does both, and this is the
         * only way to reach it.
         */
        <button
          type="button"
          className="of-crop__reset of-surface"
          data-testid="crop-reset"
          style={{
            top: `${String(frame.height + 8 / zoom)}px`,
            transform: `scale(${String(1 / zoom)})`,
          }}
          onClick={() => {
            commands.uncropImage(croppingId)
          }}
        >
          reset
        </button>
      )}
    </div>
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
