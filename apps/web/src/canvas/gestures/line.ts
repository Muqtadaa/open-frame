import type { BoardDocument, ObjectId, ObjectTypeRegistry, Point } from '@openframe/core'

import { anchorReach } from '../../scene/connect-points.js'
import { constrainToAxis } from '../../scene/draw.js'
import { attachTargetAt } from '../../scene/hit-testing.js'
import type { Gesture, GestureHandler } from './types.js'

/**
 * How close, in SCREEN pixels, an orthogonal elbow has to come to a single
 * corner before the route collapses to an L.
 *
 * Screen pixels because it is a pointer's worth of precision, converted at
 * use: fourteen world units would be a hand's width at 25% and unhittable at
 * 400%. How much STICKIER the L is once taken is the connector's own business
 * and lives in the type.
 */
const SNAP_L_PX = 14

/**
 * What this drag would do to the line it is reshaping, or null if it is not
 * reshaping one.
 *
 * Only a CONTROL point: dragging an END rubber-bands to the pointer, which is
 * the honest preview of "this end goes there" and highlights what it would
 * attach to. A bend has nothing to attach to, and rubber-banding it drew a
 * diagonal to nowhere while the line being bent sat still until the drop.
 *
 * The patch is the SAME ONE the pointer-up will dispatch, computed through the
 * registry, so what is drawn and what is committed cannot disagree. It is also
 * fed back in: the object is merged with the last preview before being asked
 * again, which is how the type can make its snap sticky — it sees its own
 * previous answer as the object's data — without this having to know what a
 * bend is.
 */
export function reshapeOf(
  active: Gesture,
  at: Point,
  runtime: { store: { getDocument: () => BoardDocument }; registry: ObjectTypeRegistry },
  previous: {
    readonly objectId: ObjectId
    readonly data: Readonly<Record<string, unknown>>
  } | null,
  zoom: number,
  /**
   * Whether this is the RELEASE rather than another preview frame.
   *
   * The drop is asked one last time on pointer-up, from the same position and
   * against the same previewed object, so the answer is the one already on
   * screen — plus whatever only a release may do. A connector's stop dragged
   * onto its neighbour is merged into it while the pointer is down and only
   * taken out of the list here, because a list that got shorter mid-drag would
   * shift every index after it and the hand would carry on moving a different
   * point.
   */
  final = false,
): { objectId: ObjectId; data: Readonly<Record<string, unknown>> } | null {
  const subject = active.subjects[0]
  if (active.mode !== 'endpoint' || subject === undefined || active.endpointId === null) return null

  const doc = runtime.store.getDocument()
  const committed = doc.objects.get(subject.id)
  if (committed === undefined) return null

  const object =
    previous !== null && previous.objectId === committed.id
      ? { ...committed, data: { ...(committed.data as object), ...previous.data } }
      : committed

  const dragged = runtime.registry
    .endpointsOf(object, doc)
    .find((endpoint) => endpoint.id === active.endpointId)
  if (dragged?.role !== 'control') return null

  const data = runtime.registry.retargetEndpoint(object, doc, active.endpointId, {
    kind: 'point',
    x: at.x,
    y: at.y,
    tolerance: SNAP_L_PX / Math.max(zoom, 0.0001),
    final,
  })
  if (data === null) return null

  /*
   * A handle that CREATED something hands the rest of the drag over.
   *
   * The midpoint of a connector's segment adds a vertex the first time it is
   * moved, and the preview it produced is fed straight back in — so asked a
   * second time it would add another, once per pointer event. Which handle
   * takes over is the type's declaration, not this function's guess: all that
   * happens here is that the gesture goes on dragging whatever it was told.
   */
  if (dragged.becomes !== undefined) active.endpointId = dragged.becomes
  return { objectId: object.id, data }
}

/**
 * A line following the pointer — a new one being drawn, or an existing one's
 * end being dragged. The same preview either way.
 */
export const moveLine: GestureHandler['move'] = ({ runtime }, active, event, worldPoint, store) => {
  active.moved = true
  /*
   * Shift holds the connector to one axis, as it does in every graphics
   * tool. The hit test uses the CONSTRAINED point, not the raw pointer:
   * attaching to whatever happens to be under the cursor while the drawn
   * line points somewhere else would make the connector attach to
   * something it visibly does not touch.
   */
  const free = event.shiftKey ? constrainToAxis(active.startWorld, worldPoint) : worldPoint
  /*
   * The anchors as well as the object. They are drawn clear of its
   * edges, so aiming at one means letting go OUTSIDE the thing being
   * aimed at — and hit testing the objects alone reported nothing at
   * exactly the moment somebody was being most deliberate.
   */
  const over = attachTargetAt(
    runtime.store.getDocument(),
    runtime.registry,
    free,
    anchorReach(store.viewport.zoom),
  )
  // The object being edited must not offer itself as a target: attaching
  // an end to its own connector is unresolvable, so it would silently
  // become a no-op rather than the free point the drop implied.
  const editing = active.subjects[0]?.id
  store.updateConnect(
    free,
    over === editing ? null : over,
    reshapeOf(
      active,
      free,
      runtime,
      store.drag.kind === 'connect' ? store.drag.reshaping : null,
      store.viewport.zoom,
    ),
  )
}
