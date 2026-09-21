import { defineObjectType } from '../../domain/registry.js'
import { boundsOfPoints, inflate, rectFromPoints } from '../../geometry/rect.js'
import { distanceToSegment } from '../../geometry/point.js'
import { endpointDependencies, resolveEndpoints } from './geometry.js'
import {
  bendAnchor,
  bendFrom,
  connectorRoute,
  flattenRoute,
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
const HIT_PADDING = 6

export const connectorType = defineObjectType<typeof CONNECTOR_TYPE, ConnectorData>({
  type: CONNECTOR_TYPE,

  schema: ConnectorDataSchema,
  currentVersion: CONNECTOR_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      from: init?.from ?? { kind: 'point', x: 0, y: 0 },
      to: init?.to ?? { kind: 'point', x: 100, y: 0 },
      routing: init?.routing ?? 'straight',
      // A new connector takes whatever route its type decides, which is what
      // `null` means here — not "no bend allowed".
      bend: init?.bend ?? null,
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
  getBounds: (object, doc) => {
    const { start, end } = resolveEndpoints(doc, object.data.from, object.data.to)
    /*
     * Over the ROUTE, not the straight line. A bent connector leaves the
     * rectangle its two ends describe, and an object whose bounds do not
     * contain it is culled while still on screen and missed by a marquee
     * dragged over it.
     */
    const route = connectorRoute(start, end, object.data.routing, object.data.bend ?? null)
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
  hitTest: (object, doc, point) => {
    const { start, end } = resolveEndpoints(doc, object.data.from, object.data.to)
    /*
     * Against the DRAWN route. This used to measure to the straight line
     * between the ends, which for anything but `straight` routing is nowhere
     * the connector goes — the corner of an orthogonal route sits half the
     * run away from the diagonal, so clicking the line you can see selected
     * nothing at all.
     */
    const points = flattenRoute(
      connectorRoute(start, end, object.data.routing, object.data.bend ?? null),
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
  endpoints: (object, doc) => {
    const { start, end } = resolveEndpoints(doc, object.data.from, object.data.to)
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
       * And the BEND, which is a draggable point like any other — declared
       * here rather than detected by the overlay, exactly as this capability's
       * own description anticipated: "a curve with control points, a route
       * with stops".
       *
       * Not for a straight route, which has nothing to bend: a control that
       * appears and does nothing is worse than one that is absent.
       */
      ...(object.data.routing === 'straight'
        ? []
        : [
            {
              id: 'bend',
              at: bendAnchor(start, end, object.data.routing, object.data.bend ?? null),
              role: 'control' as const,
            },
          ]),
    ]
  },

  /**
   * Dropping an end on an object attaches it; dropping it on empty space makes
   * it a free point.
   *
   * Attachment always uses the `auto` anchor rather than the side nearest the
   * drop. A dropped end means "join this object", and auto keeps the line
   * sensible when either object later moves — pinning the side it happened to
   * be dropped on would leave the connector entering from behind as soon as
   * anything changed.
   *
   * Attaching a connector to ITSELF is refused, since resolving that endpoint
   * would need the bounds it is currently computing.
   */
  retargetEndpoint: (object, doc, endpointId, target) => {
    /*
     * The bend takes the drop POINT and nothing else — what it landed on is
     * irrelevant, because a bend attaches to nothing. It is stored as a
     * fraction along the run and an offset across it, so it survives both ends
     * moving; storing the point itself would leave the route doubling back
     * through where the bend used to be.
     */
    if (endpointId === 'bend') {
      if (object.data.routing === 'straight') return {}
      const { start, end } = resolveEndpoints(doc, object.data.from, object.data.to)
      return { bend: bendFrom(start, end, object.data.routing, { x: target.x, y: target.y }) }
    }
    if (endpointId !== 'from' && endpointId !== 'to') return {}
    if (target.kind === 'object' && target.objectId === object.id) return {}

    const endpoint =
      target.kind === 'point'
        ? ({ kind: 'point', x: target.x, y: target.y } as const)
        : ({ kind: 'object', objectId: target.objectId, anchor: { kind: 'auto' } } as const)

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
