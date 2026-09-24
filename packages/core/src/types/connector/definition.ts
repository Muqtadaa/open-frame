import { defineObjectType } from '../../domain/registry.js'
import { boundsOfPoints, inflate, rectFromPoints, type Rect } from '../../geometry/rect.js'
import { distanceToSegment, type Point } from '../../geometry/point.js'
import { bendToPoints } from './bend-to-points.js'
import { attachmentAnchor, endpointDependencies, resolveEndpoints, type ResolvedEnds } from './geometry.js'
import type { RouteNormals } from './route.js'
import {
  bendAt,
  connectorRoute,
  flattenRoute,
  labelAnchor,
  labelFrom,
  orthogonalLegs,
  orthogonalNodes,
  pointAt,
  routeNodes,
  routeSegments,
  routeStops,
  routeVertices,
  samePoint,
  type LegAxis,
  type RouteLeg,
} from './route.js'
import {
  ARROWHEADS,
  CONNECTOR_VERSION,
  ConnectorDataSchema,
  ROUTINGS,
  type Bend,
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

/**
 * The handles an orthogonal route offers: one per leg that has somewhere to
 * write to.
 *
 * ONE function for the ids, so `endpoints` and `retargetEndpoint` cannot
 * disagree about which leg `leg:x:stop:1` means. A leg is named by WHAT IT
 * CHANGES rather than by its ordinal — the axis it moves along, and the stop
 * it moves or the slot a new one goes in — because an ordinal shifts the
 * moment a drag inserts a stop, and the rest of that drag would then be
 * sliding a different leg.
 */
interface LegHandle {
  readonly id: string
  readonly leg: RouteLeg
  /** Where it sits in the leg list, which is how its neighbours are found. */
  readonly index: number
  /** The axis a drag moves it along, which is across the way it runs. */
  readonly sets: LegAxis
  /** The handle this one hands over to once it has made its stop. */
  readonly becomes?: string
}

function legHandles(legs: readonly RouteLeg[]): LegHandle[] {
  const handles: LegHandle[] = []
  legs.forEach((leg, index) => {
    const anchor = leg.moves[0]
    if (anchor === undefined) return
    const sets: LegAxis = leg.runs === 'x' ? 'y' : 'x'
    const stop = String(anchor.stop)
    handles.push({
      id: anchor.insert ? `leg:${sets}:new:${stop}:${String(index)}` : `leg:${sets}:stop:${stop}`,
      leg,
      index,
      sets,
      /*
       * A leg held by a node that is not in the list yet makes one the first
       * time it is moved, and from then on the drag belongs to the leg that
       * moves THAT — or it would make a second stop on the next pointer
       * event, and a third.
       *
       * Which is also why a leg that inserts carries its own position in its
       * id: on a route with no stops at all, three legs would otherwise every
       * one of them be called "the leg that puts a stop at nought".
       */
      ...(anchor.insert ? { becomes: `leg:${sets}:stop:${stop}` } : {}),
    })
  })
  return handles
}

/**
 * Stops the route no longer turns at, dropped.
 *
 * Asked by DRAWING it both ways rather than by reasoning about corners: a stop
 * that changes nothing is invisible and, since legs are the only handles,
 * unreachable — and it would resurrect a jog the user flattened the moment
 * either end moved, because what it holds is relative to the run. Only ever on
 * release, when no further pointer event can be confused by the indices
 * shifting.
 */
function withoutIdleStops(
  start: Point,
  end: Point,
  points: readonly Bend[],
  normals: RouteNormals,
  avoiding: readonly Rect[],
): Bend[] {
  const drawn = (list: readonly Bend[]): readonly Point[] =>
    connectorRoute(start, end, 'orthogonal', list, normals, avoiding).points
  const same = (a: readonly Point[], b: readonly Point[]): boolean =>
    a.length === b.length &&
    a.every((point, at) => {
      const other = b[at]
      return other !== undefined && samePoint(point, other)
    })

  let kept = [...points]
  for (let index = kept.length - 1; index >= 0; index -= 1) {
    const without = [...kept.slice(0, index), ...kept.slice(index + 1)]
    if (same(drawn(without), drawn(kept))) kept = without
  }
  return kept
}

/** The middle of a leg, which is where anything that wants a point looks. */
function legMiddle(leg: RouteLeg): Point {
  return { x: (leg.from.x + leg.to.x) / 2, y: (leg.from.y + leg.to.y) / 2 }
}

/**
 * The shapes a route has to get round: the two it joins, and no others.
 *
 * Only these two, because those are the ones it is always near. A route that
 * dodged everything on the board would rearrange itself whenever anything
 * moved anywhere, which is a worse surprise than a line crossing something
 * once — and it would make every connector's geometry depend on every object,
 * which is the O(n) scan rule 10 forbids, once per object, per frame.
 */
function around(ends: ResolvedEnds): Rect[] {
  const boxes: Rect[] = []
  if (ends.startBox !== null) boxes.push(ends.startBox)
  if (ends.endBox !== null) boxes.push(ends.endBox)
  return boxes
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
      // Null, not absent: a new line's label has not been moved, and that is
      // a thing the data says rather than a thing it leaves out.
      label: init?.label ?? null,
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
  /**
   * BACK TO AUTOMATIC. A line you have shaped keeps every stop you gave it,
   * including once the objects have moved so far that the shape means nothing
   * any more — and there is no gesture for "forget all of that", because each
   * handle only knows about its own place on the route.
   *
   * Offered only when there is something to forget, so the button is never a
   * control that does nothing.
   */
  actions: [
    {
      id: 'reset',
      label: 'Reset shape',
      applies: (object) => object.data.points.length > 0,
      apply: () => ({ points: [] }),
    },
    /*
     * The label is a separate thing to put back, because it is a separate
     * thing you moved: resetting the route would otherwise drag the text
     * along with it, and a label parked deliberately out of the way of
     * something would go back for no reason anybody asked for.
     */
    {
      id: 'centre-label',
      label: 'Centre label',
      applies: (object) => object.data.label !== null && object.data.label !== undefined,
      apply: () => ({ label: null }),
    },
  ],

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
    const ends = resolveEndpoints(doc, object.data.from, object.data.to, boundsOf)
    const { start, end, startNormal, endNormal } = ends
    /*
     * Over the ROUTE, not the straight line. A bent connector leaves the
     * rectangle its two ends describe, and an object whose bounds do not
     * contain it is culled while still on screen and missed by a marquee
     * dragged over it.
     */
    const route = connectorRoute(
      start,
      end,
      object.data.routing,
      object.data.points,
      { start: startNormal, end: endNormal },
      around(ends),
    )
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
    const ends = resolveEndpoints(doc, object.data.from, object.data.to, boundsOf)
    const { start, end, startNormal, endNormal } = ends
    /*
     * Against the DRAWN route. This used to measure to the straight line
     * between the ends, which for anything but `straight` routing is nowhere
     * the connector goes — the corner of an orthogonal route sits half the
     * run away from the diagonal, so clicking the line you can see selected
     * nothing at all.
     */
    const points = flattenRoute(
      connectorRoute(
        start,
        end,
        object.data.routing,
        object.data.points,
        { start: startNormal, end: endNormal },
        around(ends),
      ),
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
    const ends = resolveEndpoints(doc, object.data.from, object.data.to, boundsOf)
    const { start, end, startNormal, endNormal } = ends
    const stops = routeStops(start, end, object.data.points)

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
        ? /*
           * LEGS, not points. A staircase is pushed about by its own sides:
           * you take hold of a run and slide it, and the runs either side
           * stretch to stay square. A dot floating at a corner would be a
           * second way to say the same thing, and it would multiply with
           * every turn the route gains.
           *
           * Only the legs with somewhere to write to. The stubs out of each
           * end are where the line meets the thing it is attached to, and
           * offering to move one is a promise that cannot be kept.
           */
          legHandles(
            orthogonalLegs(
              start,
              end,
              object.data.points,
              { start: startNormal, end: endNormal },
              around(ends),
            ),
          ).map((handle) => ({
            id: handle.id,
            at: legMiddle(handle.leg),
            role: 'control' as const,
            grip: [handle.leg.from, handle.leg.to] as const,
            shownNear: [handle.leg.from, handle.leg.to],
            ...(handle.becomes === undefined ? {} : { becomes: handle.becomes }),
          }))
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
              connectorRoute(
                start,
                end,
                object.data.routing,
                object.data.points,
                { start: startNormal, end: endNormal },
                around(ends),
              ),
            ).map((segment, index) => {
              /*
               * WHERE IN THE LIST, not which stretch. The two are the same
               * number until a stop is swallowed by its neighbour mid-drag and
               * the route pins one place fewer than the list holds — at which
               * point an ordinal would name the wrong slot. Both this and the
               * route itself read the same decomposition, so they cannot
               * disagree about it.
               */
              const insertAt = stops[index + 1]?.stop ?? object.data.points.length
              return {
                id: `midpoint:${String(insertAt)}`,
                at: segment.middle,
                role: 'control' as const,
                becomes: `vertex:${String(insertAt)}`,
                shownNear: segment.path,
              }
            }),
          ]),
      /*
       * And the LABEL, when there is one. A piece of text with nowhere to be
       * dragged to is text you cannot move off the thing it is covering — and
       * a handle for a label that does not exist is a control that does
       * nothing, so an empty connector offers none.
       *
       * LAST, so it is the one that gets pressed. On a straight line the
       * label starts exactly where the midpoint that adds a stop does, and
       * the overlay draws these in order — so reaching for the text put a
       * bend in the line instead, which then moved the text and looked for
       * all the world like it had worked.
       */
      ...(object.data.text.trim() === ''
        ? []
        : [
            {
              id: 'label',
              at: labelAnchor(
                connectorRoute(start, end, object.data.routing, object.data.points, {
                  start: startNormal,
                  end: endNormal,
                }, around(ends)),
                object.data.label,
              ),
              role: 'control' as const,
            },
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
     * The LABEL, dropped somewhere along the line.
     *
     * Stored as a fraction of the drawn route and an offset across it, for
     * the same reason a stop is: both ends move, and a coordinate would leave
     * the text stranded where the line used to be.
     */
    if (endpointId === 'label') {
      const ends = resolveEndpoints(doc, object.data.from, object.data.to, boundsOf)
      const route = connectorRoute(
        ends.start,
        ends.end,
        object.data.routing,
        object.data.points,
        { start: ends.startNormal, end: ends.endNormal },
        around(ends),
      )
      return { label: labelFrom(route, { x: target.x, y: target.y }) }
    }

    /*
     * A LEG of an orthogonal route, slid sideways.
     *
     * The drop's POINT and nothing else: a leg attaches to nothing. Only the
     * coordinate ACROSS the way it runs means anything — pushing a vertical
     * run up and down has nothing to change — and it is written to whichever
     * nodes hold the leg where it is, which the leg itself says.
     */
    if (endpointId.startsWith('leg:')) {
      if (object.data.routing !== 'orthogonal') return {}
      const ends = resolveEndpoints(doc, object.data.from, object.data.to, boundsOf)
      const { start, end, startNormal, endNormal } = ends
      const normals = { start: startNormal, end: endNormal }
      const avoiding = around(ends)
      const legs = orthogonalLegs(start, end, object.data.points, normals, avoiding)
      const handle = legHandles(legs).find((each) => each.id === endpointId)
      if (handle === undefined) return {}

      const sets = handle.sets
      const coordinate = (point: Point): number => (sets === 'x' ? point.x : point.y)
      let to = sets === 'x' ? target.x : target.y

      /*
       * SNAPPED FLUSH with a neighbour, which is how two runs merge into one
       * and how a route collapses to an L — the same "dropped onto the thing
       * next to it" rule a stop follows, said in the language of legs. The
       * values that do it are the ones that leave the leg on either side with
       * no length at all. Without the snap, landing exactly on one is a pixel
       * hunt and missing by one leaves a jog that reads as a rendering fault.
       *
       * A PINNED neighbour is not on offer: collapsing the stub would take
       * the route's departure with it, and the line would leave the object
       * from a direction it is not attached by. It still counts as being
       * flush, though — that is what a route already collapsed to an L looks
       * like, and forgetting it there is forgetting the snap exactly where it
       * has just been taken.
       */
      /*
       * SNAPPED FLUSH with a node either side of the one this leg is held by,
       * which is how two runs merge into one and how a route collapses to an
       * L — the same "dropped onto the thing next to it" rule a stop follows,
       * said in the language of legs. Landing exactly on one is otherwise a
       * pixel hunt, and missing by one leaves a jog that reads as a rendering
       * fault.
       *
       * Off the NODES rather than off the legs either side, because the leg
       * that proves the snap is the leg the snap removes: once the route has
       * collapsed there is nothing left next to it to measure against, and a
       * shape that let go at the width it was caught at would flicker under a
       * hand held at the threshold.
       */
      const anchor = handle.leg.moves[0]
      if (anchor === undefined) return {}
      const nodes = orthogonalNodes(start, end, object.data.points, normals, avoiding)
      const beside = [nodes[anchor.node - 1], nodes[anchor.node + 1]]
      const flush = beside.some(
        (node) => node !== undefined && coordinate(node) === coordinate(handle.leg.from),
      )
      let nearest = target.tolerance * (flush ? RELEASE : 1)
      for (const node of beside) {
        if (node === undefined) continue
        const away = Math.abs(coordinate(node) - to)
        if (away > nearest) continue
        nearest = away
        to = coordinate(node)
      }

      /*
       * Written to EVERY node that holds this leg, each keeping the coordinate
       * it is not being dragged along — which is what makes the run before it
       * collapse instead of the route gaining a jog nobody asked for.
       *
       * Descending, so an insertion never moves a slot still to be dealt with.
       */
      const points = [...object.data.points]
      for (const move of [...handle.leg.moves].sort((a, b) => b.stop - a.stop)) {
        const moved = sets === 'x' ? { x: to, y: move.at.y } : { x: move.at.x, y: to }
        const bend = bendAt(start, end, moved)
        if (move.insert) points.splice(move.stop, 0, bend)
        else points[move.stop] = bend
      }

      return {
        points: target.final ? withoutIdleStops(start, end, points, normals, avoiding) : points,
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
      if (stop.kind === 'midpoint') {
        if (stop.index > points.length) return {}
        points.splice(stop.index, 0, at)
        return { points }
      }
      if (stop.index >= points.length) return {}
      points[stop.index] = at

      /*
       * DROPPED ON ITS NEIGHBOUR, which is how a stop is taken off a line.
       *
       * Snapped exactly onto that neighbour rather than removed, because the
       * list cannot get shorter while the pointer is down: every index after
       * this one would shift and the drag would silently continue on a
       * different point. The route stops pinning at a place it already passes
       * through (`routeStops`), so what is drawn is already what letting go
       * commits — and only the release takes it out of the list.
       *
       * STICKIER to leave than to reach, off the same constant as the elbow's
       * L, so the line does not flicker while a hand hovers at the threshold.
       * Read off the object's own data rather than remembered by the gesture,
       * for the same reason: the preview fed back IS this object a moment on.
       */
      const nodes = routeNodes(start, end, points)
      const held = nodes[stop.index + 1]
      /*
       * The neighbours are the same before and after the move — only the
       * dragged stop has gone anywhere — so one list answers both questions.
       */
      const neighbours = [nodes[stop.index], nodes[stop.index + 2]]
      const was = object.data.points[stop.index]
      const before = was === undefined ? undefined : pointAt(start, end, was)
      const swallowed =
        before !== undefined &&
        neighbours.some((node) => node?.x === before.x && node?.y === before.y)
      const reach = target.tolerance * (swallowed ? RELEASE : 1)

      let onto: Point | null = null
      let nearest = reach
      for (const node of neighbours) {
        if (node === undefined || held === undefined) continue
        const away = Math.hypot(node.x - held.x, node.y - held.y)
        if (away > nearest) continue
        nearest = away
        onto = node
      }
      if (onto === null) return { points }

      // Gone on release; merged into its neighbour until then.
      if (target.final) {
        points.splice(stop.index, 1)
        return { points }
      }
      points[stop.index] = bendAt(start, end, onto)
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
