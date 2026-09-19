import type { Arrowhead, Point } from '@openframe/core'

import { ARROW_SIZE } from './connector-path.js'

/**
 * What a connector wears at each end.
 *
 * Pure geometry, so the shapes can be checked without rendering anything —
 * which matters more here than it looks: a cap is drawn at an arbitrary angle
 * and an error in the trigonometry is a shape that is subtly wrong at every
 * angle but the one it was eyeballed at.
 *
 * EVERY CAP SITS BEHIND THE TIP, along the line, rather than straddling it.
 * An endpoint attached to an object resolves to that object's boundary, so a
 * cap centred on the tip would bury half of itself in the thing it points at.
 * `bar` is the deliberate exception: a bar that did not straddle would just be
 * a shorter line.
 */
export interface Cap {
  readonly d: string
  /** Whether the path is a closed area to fill, or an outline to stroke. */
  readonly filled: boolean
}

const n = (value: number): string => String(Math.round(value * 100) / 100)

/** A point `distance` back from `at`, against the direction of travel. */
function back(at: Point, rotation: number, distance: number): Point {
  return { x: at.x - Math.cos(rotation) * distance, y: at.y - Math.sin(rotation) * distance }
}

/** A point `distance` to the side of `at`, square to the direction of travel. */
function side(at: Point, rotation: number, distance: number): Point {
  return {
    x: at.x + Math.cos(rotation + Math.PI / 2) * distance,
    y: at.y + Math.sin(rotation + Math.PI / 2) * distance,
  }
}

function polygon(points: readonly Point[]): string {
  const [first, ...rest] = points
  if (first === undefined) return ''
  return `M ${n(first.x)} ${n(first.y)}${rest.map((p) => ` L ${n(p.x)} ${n(p.y)}`).join('')} Z`
}

/**
 * The cap at one end, or `null` for an end that wears nothing.
 *
 * `rotation` is the direction the line is TRAVELLING as it arrives, so the
 * caller passes `angle` at the far end and `angle + PI` at the near one — the
 * same convention the open arrow already used.
 */
export function capPath(kind: Arrowhead, at: Point, rotation: number, size = ARROW_SIZE): Cap | null {
  const half = size / 2

  switch (kind) {
    case 'none':
      return null

    case 'arrow': {
      // Two strokes, not a closed shape: the original open V.
      const a = back(at, rotation - 0.4, size)
      const b = back(at, rotation + 0.4, size)
      return {
        d: `M ${n(at.x)} ${n(at.y)} L ${n(a.x)} ${n(a.y)} M ${n(at.x)} ${n(at.y)} L ${n(b.x)} ${n(b.y)}`,
        filled: false,
      }
    }

    case 'triangle': {
      const base = back(at, rotation, size)
      return { d: polygon([at, side(base, rotation, half), side(base, rotation, -half)]), filled: true }
    }

    case 'diamond': {
      const waist = back(at, rotation, half)
      const tail = back(at, rotation, size)
      return {
        d: polygon([at, side(waist, rotation, half * 0.8), tail, side(waist, rotation, -half * 0.8)]),
        filled: true,
      }
    }

    case 'dot': {
      const centre = back(at, rotation, half)
      // Two arcs rather than a <circle>, so every cap is one <path> and the
      // renderer needs no branch for the odd one out.
      return {
        d:
          `M ${n(centre.x - half)} ${n(centre.y)} ` +
          `a ${n(half)} ${n(half)} 0 1 0 ${n(size)} 0 ` +
          `a ${n(half)} ${n(half)} 0 1 0 ${n(-size)} 0 Z`,
        filled: true,
      }
    }

    case 'semicircle': {
      // A cup facing back down the line: the flat edge square to it.
      const one = side(at, rotation, half)
      const two = side(at, rotation, -half)
      return {
        d: `M ${n(one.x)} ${n(one.y)} A ${n(half)} ${n(half)} 0 0 1 ${n(two.x)} ${n(two.y)}`,
        filled: false,
      }
    }

    case 'bar': {
      const one = side(at, rotation, half)
      const two = side(at, rotation, -half)
      return { d: `M ${n(one.x)} ${n(one.y)} L ${n(two.x)} ${n(two.y)}`, filled: false }
    }
  }
}
