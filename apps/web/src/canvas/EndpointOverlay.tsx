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
  const zoom = useInteractionStore((state) => state.viewport.zoom)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)

  if (selection.size !== 1 || editingId !== null) return null
  if (dragKind === 'marquee' || dragKind === 'translate') return null

  const [id] = [...selection]
  const object = id === undefined ? undefined : document.objects.get(id)
  if (object === undefined || object.locked) return null

  const endpoints = runtime.registry.endpointsOf(object, document)
  if (endpoints.length === 0) return null

  const size = HANDLE_PX / zoom

  return (
    <>
      {endpoints.map((endpoint) => (
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
            transform: `translate(${String(endpoint.at.x - size / 2)}px, ${String(endpoint.at.y - size / 2)}px)`,
            width: `${String(size)}px`,
            height: `${String(size)}px`,
            borderWidth: `${String(1.5 / zoom)}px`,
          }}
        />
      ))}
    </>
  )
}
