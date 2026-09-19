import type { Point, Routing } from '@openframe/core'

/** Arrowhead size in world units at 100% zoom. */
export const ARROW_SIZE = 9

/**
 * The SVG path for a connector.
 *
 * Pure geometry over already-resolved endpoints — resolution itself lives in
 * the domain, because it depends on the document. Keeping the two apart means
 * routing can change without touching anything that knows about objects.
 */
export function connectorPath(start: Point, end: Point, routing: Routing): string {
  const from = `M ${String(start.x)} ${String(start.y)}`

  switch (routing) {
    case 'straight':
      return `${from} L ${String(end.x)} ${String(end.y)}`

    case 'orthogonal': {
      // Turn on the dominant axis first, which reads as a deliberate route
      // rather than a diagonal approximated with steps.
      const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
      const mid = horizontal
        ? [
            { x: (start.x + end.x) / 2, y: start.y },
            { x: (start.x + end.x) / 2, y: end.y },
          ]
        : [
            { x: start.x, y: (start.y + end.y) / 2 },
            { x: end.x, y: (start.y + end.y) / 2 },
          ]
      return `${from} L ${String(mid[0]?.x ?? 0)} ${String(mid[0]?.y ?? 0)} L ${String(mid[1]?.x ?? 0)} ${String(mid[1]?.y ?? 0)} L ${String(end.x)} ${String(end.y)}`
    }

    case 'curved': {
      // Control points offset along the dominant axis give a smooth S-curve
      // that leaves and arrives roughly perpendicular to the nearest edge.
      const dx = (end.x - start.x) * 0.5
      const dy = (end.y - start.y) * 0.5
      const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
      const c1 = horizontal ? { x: start.x + dx, y: start.y } : { x: start.x, y: start.y + dy }
      const c2 = horizontal ? { x: end.x - dx, y: end.y } : { x: end.x, y: end.y - dy }
      return `${from} C ${String(c1.x)} ${String(c1.y)}, ${String(c2.x)} ${String(c2.y)}, ${String(end.x)} ${String(end.y)}`
    }
  }
}

/** Midpoint of the path, for placing a label. */
export function pathMidpoint(start: Point, end: Point): Point {
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
}

/**
 * Which way the route runs where it MEETS each end.
 *
 * Both together, because they are not the same answer and pretending they were
 * is what made connectors wrong. A cap is oriented by the segment it sits on,
 * not by the straight line between the two endpoints — on any route that bends
 * those differ, and the cap ends up rotated off the line it is supposed to
 * finish.
 *
 * `departure` points AWAY from `start`, along the first segment. `arrival`
 * points INTO `end`, along the last. A start cap is therefore drawn at
 * `departure + PI`, so that it faces back out of the line exactly as the end
 * cap faces into it.
 */
export interface RouteAngles {
  readonly departure: number
  readonly arrival: number
}

export function routeAngles(start: Point, end: Point, routing: Routing): RouteAngles {
  const straight = Math.atan2(end.y - start.y, end.x - start.x)

  switch (routing) {
    case 'straight':
      return { departure: straight, arrival: straight }

    case 'orthogonal': {
      /*
       * THIS WAS INVERTED, and it is worth saying how.
       *
       * `connectorPath` turns on the dominant axis FIRST: when the run is
       * mostly horizontal it goes across, down, and across again — so it
       * leaves and arrives HORIZONTALLY. The old code read the same
       * `horizontal` flag and returned a vertical angle for it, and a
       * horizontal one for the vertical case. Every orthogonal connector has
       * been finishing with its arrowhead turned ninety degrees off its own
       * line.
       *
       * Both ends lie on the same axis here, because the route has three
       * segments and the first and last are parallel by construction.
       */
      const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
      if (horizontal) {
        const along = end.x >= start.x ? 0 : Math.PI
        return { departure: along, arrival: along }
      }
      const along = end.y >= start.y ? Math.PI / 2 : -Math.PI / 2
      return { departure: along, arrival: along }
    }

    case 'curved': {
      /*
       * A cubic's direction at each end is the line to its nearest control
       * point, and both are offset along the dominant axis — so a curve leaves
       * and arrives along that axis too, not along the diagonal between the
       * endpoints.
       */
      const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
      if (horizontal) {
        const along = end.x >= start.x ? 0 : Math.PI
        return { departure: along, arrival: along }
      }
      const along = end.y >= start.y ? Math.PI / 2 : -Math.PI / 2
      return { departure: along, arrival: along }
    }
  }
}

/** Angle the path arrives at `end`, for orienting an end cap. */
export function arrivalAngle(start: Point, end: Point, routing: Routing): number {
  return routeAngles(start, end, routing).arrival
}
