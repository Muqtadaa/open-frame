import type { Point, RadiusToken, ShapeKind } from '@openframe/core'

/**
 * Shape outlines and their usable label areas, in a normalised 0–100 box.
 *
 * `preserveAspectRatio="none"` lets one definition stretch to any frame, so
 * resizing needs no geometry recalculation and no per-shape special cases.
 *
 * Outline and label area are defined TOGETHER because they are the same fact.
 * A uniform `inset: 10%` was wrong for every shape with a sloped edge — a
 * triangle's label ran straight out through its sides — and would have been
 * wrong again for each polygon added afterwards. `shape-geometry.test.ts`
 * checks each label box against the vertices below rather than trusting that
 * the numbers were eyeballed correctly.
 */

/** Percentages of the 0–100 box, as CSS `inset` orders them. */
export interface LabelInset {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

/**
 * Horizontal insets carry ~2.5 points of margin over the tightest value that
 * fits, so a rounded stroke join or a sub-pixel rounding error cannot push a
 * descender through the outline.
 */
export interface ShapeGeometry {
  /** Outline vertices, or `null` for the ellipse, which is not a polygon. */
  readonly points: readonly Point[] | null
  readonly label: LabelInset
}

/** Kept just inside the box so a thick stroke is not clipped at the edge. */
const M = 2

const p = (x: number, y: number): Point => ({ x, y })

export const SHAPE_GEOMETRY: Record<ShapeKind, ShapeGeometry> = {
  rectangle: {
    points: [p(M, M), p(100 - M, M), p(100 - M, 100 - M), p(M, 100 - M)],
    label: { top: 8, right: 8, bottom: 8, left: 8 },
  },

  ellipse: {
    points: null,
    label: { top: 22, right: 14, bottom: 22, left: 14 },
  },

  /*
   * The shape that started this. Its usable width is proportional to depth —
   * zero at the apex — so a label has to sit low AND narrow. Centring it in the
   * bounding box put half the text outside the outline.
   */
  triangle: {
    points: [p(50, M), p(100 - M, 100 - M), p(M, 100 - M)],
    label: { top: 52, right: 28, bottom: 6, left: 28 },
  },

  diamond: {
    points: [p(50, M), p(100 - M, 50), p(50, 100 - M), p(M, 50)],
    label: { top: 28, right: 27, bottom: 28, left: 27 },
  },

  /** Flat top and bottom, points left and right. The usual diagram hexagon. */
  hexagon: {
    points: [p(25, M), p(75, M), p(100 - M, 50), p(75, 100 - M), p(25, 100 - M), p(M, 50)],
    label: { top: 14, right: 22, bottom: 14, left: 22 },
  },

  /** Wider at the base — flowchart "manual operation". */
  trapezoid: {
    points: [p(22, M), p(78, M), p(100 - M, 100 - M), p(M, 100 - M)],
    label: { top: 12, right: 22, bottom: 10, left: 22 },
  },

  octagon: {
    points: [
      p(32, M),
      p(68, M),
      p(100 - M, 32),
      p(100 - M, 68),
      p(68, 100 - M),
      p(32, 100 - M),
      p(M, 68),
      p(M, 32),
    ],
    label: { top: 14, right: 23, bottom: 14, left: 23 },
  },

  /** Slanted sides — flowchart "input/output". */
  parallelogram: {
    points: [p(25, M), p(100 - M, M), p(75, 100 - M), p(M, 100 - M)],
    label: { top: 13, right: 25, bottom: 13, left: 25 },
  },
}

/** The SVG `d` for a shape's outline, or `null` for the ellipse. */
export function shapePath(kind: ShapeKind): string | null {
  const { points } = SHAPE_GEOMETRY[kind]
  if (points === null) return null
  const [first, ...rest] = points
  if (first === undefined) return null
  return `M${String(first.x)} ${String(first.y)}${rest
    .map((point) => ` L${String(point.x)} ${String(point.y)}`)
    .join('')} Z`
}

/** How far a corner is cut back, in pixels, for each radius token. */
const RADIUS_PX: Readonly<Record<RadiusToken, number>> = {
  none: 0,
  small: 6,
  medium: 14,
  large: 28,
}

/**
 * The outline in FRAME units, with its corners rounded.
 *
 * Frame units rather than the normalised 0–100 box, and that is the whole
 * point. The box is stretched to the frame with `preserveAspectRatio="none"`,
 * so a radius expressed in box units is stretched with it: on a 400x100
 * rectangle a corner would come out four times wider than it is tall, which
 * reads as a rendering bug rather than as a rounded corner.
 *
 * Each corner is cut back along both of its edges and joined with a quadratic
 * curve through the vertex. A quadratic rather than an arc because the corner
 * between two edges at an arbitrary angle is not a circular arc anyway — the
 * polygons here include 45° and 60° joins — and the control point IS the
 * vertex, which makes the curve exactly tangent to both edges.
 *
 * The cut is clamped to half the shorter adjacent edge, so a large radius on a
 * small shape rounds it as far as it can go instead of turning the outline
 * inside out.
 */
export function roundedShapePath(
  kind: ShapeKind,
  size: { readonly width: number; readonly height: number },
  radius: RadiusToken,
): string | null {
  const { points } = SHAPE_GEOMETRY[kind]
  if (points === null) return null

  const scaled = points.map((point) => ({
    x: (point.x / 100) * size.width,
    y: (point.y / 100) * size.height,
  }))

  const cut = RADIUS_PX[radius]
  if (cut <= 0 || scaled.length < 3) return closedPolygon(scaled)

  const parts: string[] = []
  for (let i = 0; i < scaled.length; i++) {
    const previous = scaled[(i - 1 + scaled.length) % scaled.length]
    const corner = scaled[i]
    const next = scaled[(i + 1) % scaled.length]
    if (previous === undefined || corner === undefined || next === undefined) continue

    const back = towards(corner, previous, cut)
    const forward = towards(corner, next, cut)

    parts.push(
      i === 0 ? `M${num(back.x)} ${num(back.y)}` : `L${num(back.x)} ${num(back.y)}`,
      `Q${num(corner.x)} ${num(corner.y)} ${num(forward.x)} ${num(forward.y)}`,
    )
  }
  return `${parts.join(' ')} Z`
}

/**
 * A point `distance` along the edge from `corner` towards `end`, never past
 * its midpoint — two corners sharing a short edge must not cut into each
 * other, which is what turns an outline inside out.
 */
function towards(corner: Point, end: Point, distance: number): Point {
  const dx = end.x - corner.x
  const dy = end.y - corner.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return corner
  const travel = Math.min(distance, length / 2)
  return { x: corner.x + (dx / length) * travel, y: corner.y + (dy / length) * travel }
}

function closedPolygon(points: readonly Point[]): string {
  const [first, ...rest] = points
  if (first === undefined) return ''
  return `M${num(first.x)} ${num(first.y)}${rest
    .map((point) => ` L${num(point.x)} ${num(point.y)}`)
    .join('')} Z`
}

/** Trimmed, because a path string full of 14 decimal places is mostly noise. */
function num(value: number): string {
  return String(Math.round(value * 100) / 100)
}

/** The label area as a CSS `inset` value. */
export function labelInset(kind: ShapeKind): string {
  const { top, right, bottom, left } = SHAPE_GEOMETRY[kind].label
  return `${String(top)}% ${String(right)}% ${String(bottom)}% ${String(left)}%`
}

/**
 * Ellipse radii in the NORMALISED box.
 *
 * Still the right units for the two consumers that work in that box: the
 * draw preview, which has no frame yet because the shape does not exist, and
 * `containsPoint`, which the tests use to check label areas against outlines.
 * The rendered shape uses `ELLIPSE_MARGIN` against its real frame instead.
 */
export const ELLIPSE = { cx: 50, cy: 50, rx: 100 / 2 - M, ry: 100 / 2 - M } as const

/** The same inset, for a shape drawn at its real size. */
export const ELLIPSE_MARGIN = M

/** Ray casting. Used by the tests to check a label box against its outline. */
export function containsPoint(kind: ShapeKind, point: Point): boolean {
  const { points } = SHAPE_GEOMETRY[kind]
  if (points === null) {
    const dx = (point.x - ELLIPSE.cx) / ELLIPSE.rx
    const dy = (point.y - ELLIPSE.cy) / ELLIPSE.ry
    return dx * dx + dy * dy <= 1
  }

  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]
    const b = points[j]
    if (a === undefined || b === undefined) continue
    const straddles = a.y > point.y !== b.y > point.y
    if (straddles && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}
