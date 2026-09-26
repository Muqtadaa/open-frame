import {
  distanceToSegment,
  worldToScreen,
  type DraggableEndpoint,
  type Point,
} from '@openframe/core'

import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'

/** Same screen size as a resize handle, so the two feel like one system. */
const HANDLE_PX = 9

/**
 * How near the stretch it governs a hidden handle appears, in SCREEN pixels.
 *
 * Wider than the line's own hit padding, because this one has to be found
 * before it can be used: a handle that only appears once you are already on
 * the line is a handle you discover by accident. Screen pixels, converted at
 * use — a pointer is no more precise at 25% than at 400%.
 */
const REVEAL_PX = 20

/**
 * How thick a leg's grab bar is, in SCREEN pixels.
 *
 * Ten rather than the twenty-four a press target usually gets: a bar lies ON
 * the line it moves, and a fat one would cover the two runs either side of it
 * and offer to move those instead. It only appears while the pointer is on
 * that run, so it is never hunted for.
 */
const GRIP_PX = 10
/** Every grip's pointer target, whatever is drawn (WCAG 2.5.8). */
const TARGET_PX = 24
/** An end's border, which its target is positioned inside of. */
const END_BORDER_PX = 1.5

/**
 * Which of the handles that hide themselves is currently on offer.
 *
 * ONE at a time, and the nearest: two midpoints lit at once on adjacent
 * stretches is an invitation to press the wrong one, and every stretch lit at
 * once is the row of dots this exists to avoid.
 */
function revealed(
  endpoints: readonly DraggableEndpoint[],
  pointer: Point | null,
  zoom: number,
): string | null {
  if (pointer === null) return null
  const reach = REVEAL_PX / Math.max(zoom, 0.0001)
  let nearest: { id: string; distance: number } | null = null
  for (const endpoint of endpoints) {
    const near = endpoint.shownNear
    if (near === undefined) continue
    let distance = Number.POSITIVE_INFINITY
    for (let index = 1; index < near.length; index += 1) {
      const from = near[index - 1]
      const to = near[index]
      if (from === undefined || to === undefined) continue
      distance = Math.min(distance, distanceToSegment(pointer, from, to))
    }
    if (distance > reach) continue
    if (nearest === null || distance < nearest.distance) nearest = { id: endpoint.id, distance }
  }
  return nearest === null ? null : nearest.id
}

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
  const pointer = useInteractionStore((state) => state.pointerWorld)

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

  /*
   * A handle that hides itself shows only while the pointer is on the stretch
   * it would change.
   *
   * NOT gated on whether a drag is running, though the first version was, and
   * that version could not be pressed: the press itself starts a drag, the
   * handle unmounted between `pointerdown` and `pointerup`, and a `click`
   * needs both on the same element — so no click, no double-click, and a
   * connector's label became unreachable. (The sixth appearance of apparatus
   * that unmounts under its own press.)
   *
   * It does not need the gate. The pointer is only tracked BETWEEN gestures,
   * so during a drag it stays where the press was while the route moves away
   * from it — and the handle drops out of reach on its own, which is exactly
   * when it should.
   */
  const offered = revealed(endpoints, pointer, viewport.zoom)
  const shown = endpoints.filter(
    (endpoint) => endpoint.shownNear === undefined || endpoint.id === offered,
  )

  // A screen measurement on the screen-space layer: nothing here divides by
  // the zoom, which is what `.of-apparatus` exists to make possible.
  const size = HANDLE_PX

  return (
    <>
      {shown.map((endpoint) => {
        const at = worldToScreen(viewport, endpoint.at)
        /*
         * A GRIPPED handle is a bar along the thing it moves, not a square at
         * a point — and it is measured on the apparatus layer, so both its
         * ends convert to screen once and every length out here is what it
         * says (rule 24).
         */
        if (endpoint.grip !== undefined) {
          const [from, to] = endpoint.grip
          const a = worldToScreen(viewport, from)
          const b = worldToScreen(viewport, to)
          const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
          const width = horizontal ? Math.abs(b.x - a.x) : GRIP_PX
          const height = horizontal ? GRIP_PX : Math.abs(b.y - a.y)
          return (
            <div
              key={endpoint.id}
              className="of-endpoint of-endpoint--control of-endpoint--leg"
              data-handle="endpoint"
              data-endpoint-id={endpoint.id}
              data-testid={`endpoint-${endpoint.id}`}
              style={{
                transform: `translate(${String(Math.min(a.x, b.x) - (horizontal ? 0 : GRIP_PX / 2))}px, ${String(Math.min(a.y, b.y) - (horizontal ? GRIP_PX / 2 : 0))}px)`,
                width: `${String(width)}px`,
                height: `${String(height)}px`,
                // Which way it can be pushed, which is across the way it runs.
                cursor: horizontal ? 'ns-resize' : 'ew-resize',
              }}
            >
              {/*
               * 24 across, however thin the bar is drawn: the drawn weight is
               * about not reading as a second line, the target is WCAG 2.5.8.
               */}
              <span
                className="of-endpoint__target"
                aria-hidden="true"
                style={
                  horizontal
                    ? {
                        left: 0,
                        right: 0,
                        top: `${String(-(TARGET_PX - GRIP_PX) / 2)}px`,
                        bottom: `${String(-(TARGET_PX - GRIP_PX) / 2)}px`,
                      }
                    : {
                        top: 0,
                        bottom: 0,
                        left: `${String(-(TARGET_PX - GRIP_PX) / 2)}px`,
                        right: `${String(-(TARGET_PX - GRIP_PX) / 2)}px`,
                      }
                }
              />
            </div>
          )
        }
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
          >
            {/*
             * The target. Placing a line's end is the most precise gesture on
             * the board, and it had the smallest target on it — the drawn 9px
             * dot and nothing more.
             */}
            <span
              className="of-endpoint__target"
              aria-hidden="true"
              style={{ inset: `${String(-(TARGET_PX - size) / 2 - END_BORDER_PX)}px` }}
            />
          </div>
        )
      })}
    </>
  )
}
