import { unionAll, type Rect } from './rect.js'

/**
 * Aligning and distributing a selection.
 *
 * Pure rectangle arithmetic, in core, because it is the same answer whether it
 * is asked by a button, by the API or later by an AI tool call — and because
 * it is the part worth testing exhaustively without a browser.
 *
 * Everything here works in OFFSETS rather than positions. The caller has a
 * command that moves objects by a delta and cascades into their contents, so
 * an offset drops straight into it; positions would make the caller subtract
 * to get back to a delta, and would be wrong for a container whose children
 * must travel with it.
 */

/** Which edge, or which centre line, everything lines up on. */
export type AlignEdge = 'left' | 'centerX' | 'right' | 'top' | 'middleY' | 'bottom'

/** The axis along which the gaps are evened out. */
export type DistributeAxis = 'x' | 'y'

/** One thing being arranged, and the extent it presents. */
export interface Arrangeable<Id> {
  readonly id: Id
  /**
   * From the registry, never from `object.frame`.
   *
   * A rotated object's extent is not its frame, and a connector has no
   * meaningful frame at all — aligning on frames would put a rotated note
   * visibly off the line everything else landed on.
   */
  readonly bounds: Rect
}

/** How far one thing has to move. Zero for both means it is already right. */
export interface Offset<Id> {
  readonly id: Id
  readonly dx: number
  readonly dy: number
}

/** Whether an edge works along x or y. */
function axisOf(edge: AlignEdge): DistributeAxis {
  return edge === 'left' || edge === 'centerX' || edge === 'right' ? 'x' : 'y'
}

function startOf(rect: Rect, axis: DistributeAxis): number {
  return axis === 'x' ? rect.x : rect.y
}

function sizeOf(rect: Rect, axis: DistributeAxis): number {
  return axis === 'x' ? rect.width : rect.height
}

/**
 * Where on the reference box an edge sits, and where on an item.
 *
 * The same function for both, which is the whole trick: aligning means putting
 * the item's own line on the reference's line, so the offset is one subtraction
 * and there is no separate case per edge.
 */
function lineOf(rect: Rect, edge: AlignEdge): number {
  switch (edge) {
    case 'left':
      return rect.x
    case 'centerX':
      return rect.x + rect.width / 2
    case 'right':
      return rect.x + rect.width
    case 'top':
      return rect.y
    case 'middleY':
      return rect.y + rect.height / 2
    case 'bottom':
      return rect.y + rect.height
  }
}

/**
 * How far each item must move to line up on `edge`.
 *
 * The reference is the SELECTION'S OWN bounding box — align-left goes to the
 * leftmost edge among the things selected, not to the board or to a frame.
 * That is what every tool that has this does, and it needs to know nothing
 * about parents.
 *
 * Fewer than two things have nothing to line up with, so they get nothing.
 */
export function alignOffsets<Id>(
  items: readonly Arrangeable<Id>[],
  edge: AlignEdge,
): readonly Offset<Id>[] {
  if (items.length < 2) return []
  const reference = unionAll(items.map((item) => item.bounds))
  if (reference === null) return []

  const target = lineOf(reference, edge)
  const axis = axisOf(edge)

  return items.map((item) => {
    const delta = target - lineOf(item.bounds, edge)
    return axis === 'x' ? { id: item.id, dx: delta, dy: 0 } : { id: item.id, dx: 0, dy: delta }
  })
}

/**
 * How far each item must move for the GAPS between them to be equal.
 *
 * The outermost two stay exactly where they are and everything between is
 * respaced, which is what makes this feel like tidying rather than moving: the
 * extent of the selection does not change.
 *
 * Equal GAPS, not equal centres. With objects of different sizes those are
 * different answers, and evenly spaced centres leave visibly uneven gaps —
 * which reads as a bug in the feature rather than as the thing it does.
 *
 * Fewer than three has nothing between the ends to distribute.
 */
export function distributeOffsets<Id>(
  items: readonly Arrangeable<Id>[],
  axis: DistributeAxis,
): readonly Offset<Id>[] {
  if (items.length < 3) return []

  const order = [...items].sort((a, b) => startOf(a.bounds, axis) - startOf(b.bounds, axis))
  const first = order[0]
  const last = order[order.length - 1]
  if (first === undefined || last === undefined) return []

  const from = startOf(first.bounds, axis)
  const to = startOf(last.bounds, axis) + sizeOf(last.bounds, axis)
  const occupied = order.reduce((total, item) => total + sizeOf(item.bounds, axis), 0)
  /*
   * A NEGATIVE gap is a real answer, not an error. Objects that overlap more
   * than the span they cover get evenly overlapped rather than refused — the
   * alternative is a button that silently does nothing on a stack of cards,
   * which is a common thing to want tidied.
   */
  const gap = (to - from - occupied) / (order.length - 1)

  const offsets: Offset<Id>[] = []
  let cursor = from
  for (const item of order) {
    const delta = cursor - startOf(item.bounds, axis)
    offsets.push(axis === 'x' ? { id: item.id, dx: delta, dy: 0 } : { id: item.id, dx: 0, dy: delta })
    cursor += sizeOf(item.bounds, axis) + gap
  }
  return offsets
}
