import { contains, intersects, type Point, type Rect } from '@openframe/core'

/** How many rings out from the source a free place is looked for. */
const RINGS = 4

/**
 * Where an object derived from a cluster is put.
 *
 * Above the cluster, centred, with a gap, when that is free — the spatial
 * relationship IS the explanation until somebody reads the panel. When it is
 * not, the other three sides in turn, and then each side again one step
 * further out: "above" on a board of stacked clusters was on top of the next
 * cluster up, hiding the evidence it was meant to sit beside.
 *
 * A free place already in `view` beats a free place anywhere: the new object
 * is revealed once it exists, and one that lands off screen makes the camera
 * jump away from what was just selected. When nothing is free it goes above
 * anyway, which is where it always went.
 *
 * Called once per derive, never per frame, so the scan over `occupied` is
 * fine (rule 10).
 */
export function placeDerived(
  source: Rect,
  size: { readonly width: number; readonly height: number },
  occupied: readonly (Rect & { readonly container?: boolean })[],
  view: Rect,
  gap: number,
  snap: (at: Point) => Point = (at) => at,
): Point {
  const centreX = source.x + source.width / 2 - size.width / 2
  const centreY = source.y + source.height / 2 - size.height / 2
  // Snapped BEFORE they are checked, so what is checked is where it lands.
  const candidates: Point[] = []
  for (let ring = 0; ring < RINGS; ring++) {
    const down = gap + ring * (size.height + gap)
    const across = gap + ring * (size.width + gap)
    candidates.push(
      ...[
        { x: centreX, y: source.y - size.height - down },
        { x: source.x + source.width + across, y: centreY },
        { x: centreX, y: source.y + source.height + down },
        { x: source.x - size.width - across, y: centreY },
      ].map((at) => snap(at)),
    )
  }
  /*
   * A container the source sits INSIDE is not in the way: every place beside
   * a cluster in a frame is inside that frame too, and counting it pushed the
   * new slip out past the frame's edge.
   */
  const solid = occupied.filter((other) => other.container !== true || !contains(other, source))
  const box = (at: Point): Rect => ({ ...at, width: size.width, height: size.height })
  const free = (at: Point): boolean => !solid.some((other) => intersects(box(at), other))
  const first = candidates[0] ?? snap({ x: centreX, y: source.y - size.height - gap })
  return (
    candidates.find((at) => free(at) && contains(view, box(at))) ?? candidates.find(free) ?? first
  )
}
