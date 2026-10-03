import type { ObjectId, Point, Rect, RelationLink } from '@openframe/core'

/**
 * A selected object's relations, as lines between the things they join.
 *
 * Relations have no appearance on the board (ADR 0011), and were readable only
 * in the record panel: "stands on" was a list of names with nothing pointing
 * at where the evidence sits. They are drawn for the SELECTION only. A board
 * that drew every citation at once would be a hairball on any real synthesis,
 * and the question being answered is always about one thing — "what is this
 * standing on?"
 *
 * Pure geometry over rectangles, handed the links already looked up: the
 * registry's relation index answers both directions in O(1), so nothing here
 * scans the document (rule 10).
 */

export interface RelationLine {
  /** The relation object's id, so a line has a stable key. */
  readonly id: ObjectId
  readonly predicate: string
  /** Where the relation runs FROM and TO, on the edges facing each other. */
  readonly from: Point
  readonly to: Point
}

function centre(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
}

function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/**
 * Where a line from the box's centre towards `towards` leaves the box.
 *
 * So a relation runs edge to edge, through the gap between two things, rather
 * than under both of them to their middles.
 */
export function clipToEdge(rect: Rect, towards: Point): Point {
  const middle = centre(rect)
  const dx = towards.x - middle.x
  const dy = towards.y - middle.y
  if (dx === 0 && dy === 0) return middle
  const scaleX = dx === 0 ? Infinity : rect.width / 2 / Math.abs(dx)
  const scaleY = dy === 0 ? Infinity : rect.height / 2 / Math.abs(dy)
  const scale = Math.min(scaleX, scaleY)
  return { x: middle.x + dx * scale, y: middle.y + dy * scale }
}

export function relationLines(
  selected: ObjectId,
  cites: readonly RelationLink[],
  citedBy: readonly RelationLink[],
  boundsOf: (id: ObjectId) => Rect | null,
): readonly RelationLine[] {
  const lines: RelationLine[] = []
  for (const link of [...cites, ...citedBy]) {
    // Only the selection's own relations: every line shares that end.
    if (link.edge.from !== selected && link.edge.to !== selected) continue
    if (link.edge.from === link.edge.to) continue
    const fromBox = boundsOf(link.edge.from)
    const toBox = boundsOf(link.edge.to)
    if (fromBox === null || toBox === null) continue
    const from = clipToEdge(fromBox, centre(toBox))
    const to = clipToEdge(toBox, centre(fromBox))
    // Overlapping boxes have no gap to cross; a line drawn back across one of
    // them would point the wrong way.
    if (contains(toBox, from) || contains(fromBox, to)) continue
    lines.push({ id: link.id, predicate: link.edge.predicate, from, to })
  }
  return lines
}
