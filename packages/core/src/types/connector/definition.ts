import { defineObjectType } from '../../domain/registry.js'
import { boundsOfPoints, inflate, rectFromPoints } from '../../geometry/rect.js'
import { distanceToSegment } from '../../geometry/point.js'
import { bendToPoints } from './bend-to-points.js'
import { attachmentAnchor, endpointDependencies, resolveEndpoints } from './geometry.js'
import {
  bendAt,
  connectorRoute,
  elbowAnchor,
  elbowFrom,
  heldPoint,
  flattenRoute,
  pointAt,
  routeSegments,
  routeVertices,
} from './route.js'
import {
  ARROWHEADS,
  CONNECTOR_VERSION,
  ConnectorDataSchema,
  ROUTINGS,
  type ConnectorData,
} from './schema.js'

export const CONNECTOR_TYPE = 'connector'

/** Padding so a thin diagonal line is still comfortably clickable. */
/**
 * How much further the elbow must travel to let go of an L than to take one.
 *
 * Twice, which reads as deliberate without making the route feel stuck. The
 * distance itself comes from the drop, because only the view knows how many
 * world units a pointer's worth of precision is at this zoom.
 */
const RELEASE = 2

const HIT_PADDING = 6

/**
 * What a `vertex:2` or `midpoint:0` handle names.
 *
 * The index is IN the id because a drag carries nothing else: the gesture
 * hands back the id it grabbed and a point in the world, so the id has to say
 * which of several identical-looking handles it was. Anything that is not one
 * of these two forms is somebody else's handle and answers null.
 */
function stopIndex(endpointId: string): { kind: 'vertex' | 'midpoint'; index: number } | null {
  const [kind, rest, ...extra] = endpointId.split(':')
  if (extra.length > 0 || rest === undefined) return null
  if (kind !== 'vertex' && kind !== 'midpoint') return null
  const index = Number(rest)
  if (!Number.isInteger(index) || index < 0) return null
  return { kind, index }
}

export const connectorType = defineObjectType<typeof CONNECTOR_TYPE, ConnectorData>({
  type: CONNECTOR_TYPE,

  schema: ConnectorDataSchema,
  currentVersion: CONNECTOR_VERSION,
  migrations: { 2: bendToPoints },

  create: (init) => ({
    data: {
      from: init?.from ?? { kind: 'point', x: 0, y: 0 },
      to: init?.to ?? { kind: 'point', x: 100, y: 0 },
      routing: init?.routing ?? 'straight',
      // A new connector takes whatever route its type decides, which is what
      // an empty list means here — not "this line cannot be bent".
      points: init?.points ?? [],
      startArrow: init?.startArrow ?? 'none',
      endArrow: init?.endArrow ?? 'arrow',
      text: init?.text ?? '',
    },
    // A connector has no meaningful frame — its extent is wherever its ends
    // resolve to. `getBounds` supplies the real answer.
    frame: { width: 0, height: 0 },
  }),

  capabilities: {
    // Resized and rotated by moving its ENDS, not by handles on a box.
    resizable: false,
    rotatable: false,
    textEditable: true,
    spatial: true,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: false,
    styleProps: ['color', 'textColor', 'strokeColor', 'stroke', 'dash', 'opacity'],
  },

  /*
   * The two ends and the route, declared rather than drawn by a panel.
   *
   * DIRECTION IS NOT A FIELD. A line that points one way has a cap at one end,
   * both ways has two, neither has none — the two ends already say it, and a
   * third value saying the same thing is the copy that goes stale. It is also
   * why these are `data` and not `style`: which way a connector points is what
   * it MEANS, not how it looks.
   */
  fields: [
    { key: 'routing', label: 'Route', kind: 'select', options: ROUTINGS },
    { key: 'startArrow', label: 'Start', kind: 'select', options: ARROWHEADS },
    { key: 'endArrow', label: 'End', kind: 'select', options: ARROWHEADS },
  ],

  /**
   * Bounds come from the resolved endpoints, not from `frame`.
   *
   * This is why `getBounds` receives the document: a connector's extent depends
   * on objects it merely references, and culling, hit testing and zoom-to-fit
   * all need the real answer.
   */
  getBounds: (object, doc, { boundsOf }) => {
    const { start, end, startNormal, endNormal } = resolveEndpoints(
      doc,
      object.data.from,
      object.data.to,
      boundsOf,
    )
    /*
     * Over the ROUTE, not the straight line. A bent connector leaves the
     * rectangle its two ends describe, and an object whose bounds do not
     * contain it is culled while still on screen and missed by a marquee
     * dragged over it.
     */
    const route = connectorRoute(start, end, object.data.routing, object.data.points, {
      start: startNormal,
      end: endNormal,
    })
    // A route always has at least its two ends, so the fallback is for a
    // shape that cannot occur rather than one that might.
    const box = boundsOfPoints(routeVertices(route)) ?? rectFromPoints(start, end)
    return inflate(box, HIT_PADDING)
  },

  /**
   * Hit within a few units of the LINE, not anywhere in the bounding rectangle.
   * Bounds containment would make clicking the empty space between two
   * connected objects select the connector joining them.
   */
  hitTest: (object, doc, point, { boundsOf }) => {
    const { start, end, startNormal, endNormal } = resolveEndpoints(
      doc,
      object.data.from,
      object.data.to,
      boundsOf,
    )
    /*
     * Against the DRAWN route. This used to measure to the straight line
     * between the ends, which for anything but `straight` routing is nowhere
     * the connector goes — the corner of an orthogonal route sits half the
     * run away from the diagonal, so clicking the line you can see selected
     * nothing at all.
     */
    const points = flattenRoute(
      connectorRoute(start, end, object.data.routing, object.data.points, {
        start: startNormal,
        end: endNormal,
      }),
    )
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1]
      const b = points[index]
      if (a === undefined || b === undefined) continue
      if (distanceToSegment(point, a, b) <= HIT_PADDING * 2) return true
    }
    return false
  },

  /** Redraw when either end moves. */
  dependencies: (object) => endpointDependencies(object.data.from, object.data.to),

  /** Both ends are draggable, at wherever they currently resolve to. */
  endpoints: (object, doc, { boundsOf }) => {
    const { start, end, startNormal, endNormal } = resolveEndpoints(
      doc,
      object.data.from,
      object.data.to,
      boundsOf,
    )
    return [
      {
        id: 'from',
        at: start,
        ...(object.data.from.kind === 'object' ? { attachedTo: object.data.from.objectId } : {}),
      },
      {
        id: 'to',
        at: end,
        ...(object.data.to.kind === 'object' ? { attachedTo: object.data.to.objectId } : {}),
      },
      /*
       * And every place the route is HELD, which are draggable points like any
       * other — declared here rather than detected by the overlay, exactly as
       * this capability's own description anticipated: "a curve with control
       * points, a route with stops".
       *
       * An orthogonal route still has exactly one, and it is an elbow rather
       * than a stop: it slides along one axis and there is nowhere to put a
       * second one until legs can be dragged by their own side.
       */
      ...(object.data.routing === 'orthogonal'
        ? [
            {
              id: 'bend',
              at: elbowAnchor(start, end, heldPoint(object.data.points), {
                start: startNormal,
                end: endNormal,
              }),
              role: 'control' as const,
            },
          ]
        : [
            ...object.data.points.map((bend, index) => ({
              id: `vertex:${String(index)}`,
              at: pointAt(start, end, bend),
              role: 'control' as const,
            })),
            /*
             * And a midpoint per drawn stretch, which is how a new vertex is
             * made: drag the middle of a segment and the route starts passing
             * through where you let go. There is one per segment and never one
             * per route, because "add a point" has to say WHERE in the order
             * it goes — a route that ran back on itself would be the answer to
             * guessing.
             *
             * Each hands over to the vertex it creates, so the second move of
             * the same drag moves that point rather than adding another.
             */
            ...routeSegments(
              connectorRoute(start, end, object.data.routing, object.data.points, {
                start: startNormal,
                end: endNormal,
              }),
            ).map((segment, index) => ({
              id: `midpoint:${String(index)}`,
              at: segment.middle,
              role: 'control' as const,
              becomes: `vertex:${String(index)}`,
              shownNear: segment.path,
            })),
          ]),
    ]
  },

  /**
   * Dropping an end on an object attaches it; dropping it on empty space makes
   * it a free point.
   *
   * WHERE on the object depends on where you let go. Dropped on one of its
   * anchors, the end pins to that side and stays there; dropped anywhere else
   * on it, the anchor is `auto` and re-picks the facing side whenever either
   * object moves. This used to be `auto` unconditionally, on the argument that
   * a pinned side would leave a connector entering from behind once things
   * moved — true, and not a reason to discard an aim somebody took. Both
   * behaviours are now reachable, and which one you get is what you did.
   *
   * Attaching a connector to ITSELF is refused, since resolving that endpoint
   * would need the bounds it is currently computing.
   */
  retargetEndpoint: (object, doc, endpointId, target, { boundsOf }) => {
    /*
     * The bend takes the drop POINT and nothing else — what it landed on is
     * irrelevant, because a bend attaches to nothing. It is stored as a
     * fraction along the run and an offset across it, so it survives both ends
     * moving; storing the point itself would leave the route doubling back
     * through where the bend used to be.
     */
    if (endpointId === 'bend') {
      // Only an orthogonal route has one. The other two are held by the points
      // they pass through, which are handles of their own.
      if (object.data.routing !== 'orthogonal') return {}
      const { start, end, startNormal, endNormal } = resolveEndpoints(
        doc,
        object.data.from,
        object.data.to,
        boundsOf,
      )
      /*
       * The drop's tolerance means "how close collapses this to an L" here,
       * which is the same question it always asks — how close counts — put to
       * the part of the type that is being dragged. A curve has no L to find
       * and ignores it.
       *
       * STICKIER once it has taken: a route already collapsed holds its shape
       * until the elbow is pulled meaningfully away, or the L would flicker on
       * and off while a hand hovered at the threshold. Read off the object's
       * own bend rather than remembered by the gesture — which is what lets
       * the caller stay ignorant of what a bend even is, since the preview it
       * feeds back IS this object's data a moment later.
       */
      const held = heldPoint(object.data.points)
      const collapsed =
        held !== null && held !== undefined && (held.along === 0 || held.along === 1)
      /*
       * A LIST of one, and only one. An orthogonal route's elbow REPLACES
       * whatever the route was held by: it is the offset of the whole middle
       * segment rather than a place the line passes through, and two of them
       * would describe two different routes.
       */
      return {
        points: [
          elbowFrom(
            start,
            end,
            { x: target.x, y: target.y },
            { start: startNormal, end: endNormal },
            target.tolerance * (collapsed ? RELEASE : 1),
          ),
        ],
      }
    }
    /*
     * A VERTEX the route passes through, or the midpoint that creates one.
     *
     * Both answer the same question — what should be at this index — so they
     * share the arithmetic and differ in one word: a vertex replaces, a
     * midpoint inserts. The handle that inserted hands over to the vertex it
     * made (`becomes`), so a drag that starts on a midpoint goes on moving
     * that one point rather than adding a point per pointer event.
     */
    const stop = stopIndex(endpointId)
    if (stop !== null) {
      // An orthogonal route is held by its elbow alone until legs can be
      // dragged by their own side; it offers no handle that lands here.
      if (object.data.routing === 'orthogonal') return {}
      const { start, end } = resolveEndpoints(doc, object.data.from, object.data.to, boundsOf)
      const points = [...object.data.points]
      const at = bendAt(start, end, { x: target.x, y: target.y })
      if (stop.kind === 'vertex') {
        if (stop.index >= points.length) return {}
        points[stop.index] = at
      } else {
        if (stop.index > points.length) return {}
        points.splice(stop.index, 0, at)
      }
      return { points }
    }

    if (endpointId !== 'from' && endpointId !== 'to') return {}
    if (target.kind === 'object' && target.objectId === object.id) return {}

    const onto = target.kind === 'object' ? doc.objects.get(target.objectId) : undefined
    const endpoint =
      target.kind === 'point' || onto === undefined
        ? ({ kind: 'point', x: target.x, y: target.y } as const)
        : ({
            kind: 'object',
            objectId: target.objectId,
            anchor: attachmentAnchor(
              onto,
              { x: target.x, y: target.y },
              target.tolerance,
              boundsOf,
            ),
          } as const)

    return endpointId === 'from' ? { from: endpoint } : { to: endpoint }
  },

  describe: (object) => ({
    searchText: object.data.text,
    summary: object.data.text.trim() === '' ? 'Connector' : `Connector: ${object.data.text}`,
    fields: {
      text: object.data.text,
      routing: object.data.routing,
      // Declared, so described. The contract test refuses a field a type
      // offers but never reports — the guard that stops a declaration being
      // decoration, as `sticky`'s ignored `fill` was.
      startArrow: object.data.startArrow,
      endArrow: object.data.endArrow,
    },
  }),
})
