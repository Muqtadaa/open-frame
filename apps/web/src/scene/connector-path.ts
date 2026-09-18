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

/** Angle the path arrives at `end`, for orienting an arrowhead. */
export function arrivalAngle(start: Point, end: Point, routing: Routing): number {
  if (routing !== 'orthogonal') return Math.atan2(end.y - start.y, end.x - start.x)
  // An orthogonal route always arrives along one axis, so snap to it.
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y)
  if (horizontal) return end.y >= start.y ? Math.PI / 2 : -Math.PI / 2
  return end.x >= start.x ? 0 : Math.PI
}
