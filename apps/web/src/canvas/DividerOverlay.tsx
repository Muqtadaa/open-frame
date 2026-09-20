import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'

/** How wide a boundary is to grab, in screen pixels (WCAG 2.5.8). */
const GRAB_PX = 14

/**
 * Grab handles on the divisions INSIDE a selected object — a table's column
 * and row boundaries.
 *
 * Asks the REGISTRY which divisions an object has rather than looking for a
 * table. Every other type answers with none, so this renders nothing for them
 * and needs no knowledge of what a table is; the next type with internal
 * divisions gets handles by declaring them, exactly as `EndpointOverlay` works
 * for types with ends.
 *
 * Only for a single selection, for the same reason: dragging one boundary of
 * one table is the gesture, and with several selected the meaningful action is
 * moving them together.
 */
export function DividerOverlay() {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const zoom = useInteractionStore((state) => state.viewport.zoom)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)

  if (selection.size !== 1 || editingId !== null) return null
  // Hidden while the object is being moved or drawn, like every other handle —
  // but NOT while a divider itself is being dragged, which is this gesture.
  if (dragKind === 'marquee' || dragKind === 'translate' || dragKind === 'draw') return null

  const [id] = [...selection]
  const object = id === undefined ? undefined : document.objects.get(id)
  if (object === undefined || object.locked) return null

  const dividers = runtime.registry.dividersOf(object)
  if (dividers.length === 0) return null

  const bounds = runtime.registry.boundsOf(object, document)
  const grab = GRAB_PX / zoom

  return (
    <>
      {dividers.map((divider) => {
        const across = divider.axis === 'x'
        /*
         * `at` is a FRACTION of the object's extent, so the handle lands in
         * the right place whatever size the object is now — and the type never
         * has to know where on the board it sits.
         */
        const x = across ? bounds.x + bounds.width * divider.at : bounds.x
        const y = across ? bounds.y : bounds.y + bounds.height * divider.at

        return (
          <div
            key={divider.id}
            className={`of-divider of-divider--${divider.axis}`}
            // Read back by the gesture, which does not otherwise know what was
            // grabbed — the same handshake the endpoint handles use.
            data-handle="divider"
            data-divider-id={divider.id}
            data-testid={`divider-${divider.id}`}
            style={{
              transform: `translate(${String(across ? x - grab / 2 : x)}px, ${String(
                across ? y : y - grab / 2,
              )}px)`,
              width: `${String(across ? grab : bounds.width)}px`,
              height: `${String(across ? bounds.height : grab)}px`,
            }}
          />
        )
      })}
    </>
  )
}
