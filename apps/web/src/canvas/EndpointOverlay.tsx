import { worldToScreen } from '@openframe/core'

import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'

/** Same screen size as a resize handle, so the two feel like one system. */
const HANDLE_PX = 9

/**
 * Grab handles on the draggable ends of a selected object.
 *
 * Asks the REGISTRY which ends an object has rather than looking for a
 * connector. Every other type answers with none, so this renders nothing for
 * them and needs no knowledge of what a connector is — the next type with ends
 * gets handles by declaring them.
 *
 * Only for a single selection: dragging one end of one line is the gesture;
 * with several selected, the meaningful action is moving them together.
 */
export function EndpointOverlay() {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const viewport = useInteractionStore((state) => state.viewport)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)
  /*
   * What the line being reshaped would become. A stable reference from the
   * store, so it is safe in a selector (rule 9).
   */
  const reshaping = useInteractionStore((state) =>
    state.drag.kind === 'connect' ? (state.drag.reshaping?.data ?? null) : null,
  )

  if (selection.size !== 1 || editingId !== null) return null
  if (dragKind === 'marquee' || dragKind === 'translate') return null

  const [id] = [...selection]
  const object = id === undefined ? undefined : document.objects.get(id)
  if (object === undefined || object.locked) return null

  /*
   * The handles follow the PREVIEW, not the committed data.
   *
   * A control point that stayed at the old elbow while the route moved under
   * it is the same fault as the route not moving at all: the thing you are
   * dragging has to be where you dragged it. Merged exactly as `ObjectView`
   * merges it to draw the line, so both read the same pending patch.
   */
  const previewed =
    reshaping === null ? object : { ...object, data: { ...(object.data as object), ...reshaping } }
  const endpoints = runtime.registry.endpointsOf(previewed, document)
  if (endpoints.length === 0) return null

  // A screen measurement on the screen-space layer: nothing here divides by
  // the zoom, which is what `.of-apparatus` exists to make possible.
  const size = HANDLE_PX

  return (
    <>
      {endpoints.map((endpoint) => {
        const at = worldToScreen(viewport, endpoint.at)
        return (
          <div
            key={endpoint.id}
            /*
             * A CONTROL is drawn differently from an END, because they do
             * different things: an end decides where the line stops, a control
             * only shapes what runs between them. Identical, the middle one
             * reads as a third end and gets dragged onto an object in the
             * expectation that the line will attach there.
             */
            className={`of-endpoint${endpoint.attachedTo === undefined ? '' : ' of-endpoint--attached'}${
              endpoint.role === 'control' ? ' of-endpoint--control' : ''
            }`}
            // Read back by the gesture, which does not otherwise know what was grabbed.
            data-handle="endpoint"
            data-endpoint-id={endpoint.id}
            data-testid={`endpoint-${endpoint.id}`}
            style={{
              transform: `translate(${String(at.x - size / 2)}px, ${String(at.y - size / 2)}px)`,
              width: `${String(size)}px`,
              height: `${String(size)}px`,
            }}
          />
        )
      })}
    </>
  )
}
