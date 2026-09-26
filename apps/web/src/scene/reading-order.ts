/**
 * Objects in the order a page is read: rows from the top, each row from the
 * left.
 *
 * A ROW is objects whose tops are close to one another — within `band` of the
 * first in the row — not a fixed band of the board. Rounding each top into an
 * absolute bucket put two notes two units apart into different rows whenever
 * they straddled a bucket's edge, and Tab then read the right-hand one first.
 */
export function readingOrder(
  entries: readonly { readonly id: string; readonly x: number; readonly y: number }[],
  band: number,
): string[] {
  const byTop = [...entries].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: (typeof byTop)[] = []
  for (const entry of byTop) {
    const row = rows[rows.length - 1]
    const first = row?.[0]
    if (row !== undefined && first !== undefined && entry.y - first.y <= band) row.push(entry)
    else rows.push([entry])
  }
  return rows.flatMap((row) => [...row].sort((a, b) => a.x - b.x).map((entry) => entry.id))
}
