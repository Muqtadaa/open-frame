import { useMemo } from 'react'

import { useOpenFrame } from '../app/runtime-context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { HANDLES, HANDLE_CURSORS, framesBounds, handleAnchor } from './resize.js'

/** Handles stay this many SCREEN pixels across, whatever the zoom. */
const HANDLE_PX = 9
const ROTATE_OFFSET_PX = 26

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

  const bounds = useMemo(() => framesBounds(objects), [objects])

  // Hidden while marquee-selecting or editing text: the box would sit on top of
  // the thing the user is currently working with.
  if (bounds === null || dragKind === 'marquee' || editingId !== null) return null

  const single = objects.length === 1 ? objects[0] : undefined
  const rotation = single?.frame.rotation ?? 0
  const box = single === undefined ? bounds : single.frame
  const rotatable =
    single !== undefined &&
    !single.locked &&
    runtime.registry.get(single.type)?.capabilities.rotatable === true
  const resizable =
    objects.every((object) => !object.locked) &&
    objects.every((object) => runtime.registry.get(object.type)?.capabilities.resizable !== false)

  const size = HANDLE_PX / zoom
  const half = size / 2

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
              style={{
                left: `${String(anchor.x * box.width - half)}px`,
                top: `${String(anchor.y * box.height - half)}px`,
                width: `${String(size)}px`,
                height: `${String(size)}px`,
                borderWidth: `${String(1 / zoom)}px`,
                borderRadius: `${String(2 / zoom)}px`,
                cursor: HANDLE_CURSORS[handle],
              }}
            />
          )
        })}

      {rotatable && (
        <div
          className="of-handle of-handle--rotate"
          data-handle="rotate"
          data-testid="handle-rotate"
          style={{
            left: `${String(box.width / 2 - half)}px`,
            top: `${String(-ROTATE_OFFSET_PX / zoom - half)}px`,
            width: `${String(size)}px`,
            height: `${String(size)}px`,
            borderWidth: `${String(1 / zoom)}px`,
          }}
        />
      )}
    </div>
  )
}
