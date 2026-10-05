import { type Merge, type TableData } from '@openframe/core'

/*
 * Where a table's tracks and merges fall: the arithmetic shared by drawing a table and editing one.
 */

/** Where each track boundary falls, in the object's own units, ends included. */
export function edgesOf(weights: readonly number[], extent: number): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const found = [0]
  let running = 0
  for (const weight of weights) {
    running += weight
    found.push(total > 0 ? (running / total) * extent : 0)
  }
  return found
}

/** The same, as fractions — the unit apparatus is placed in. */
export function fractionsOf(weights: readonly number[]): number[] {
  return edgesOf(weights, 1)
}

/**
 * Which cells a merge hides, and which cells anchor one, found ONCE per draw.
 *
 * Asked per cell, `mergeAt` is a scan of every merge per cell — rule 10 on a
 * grid that may hold five thousand of them.
 */
export function mergeIndex(data: TableData): {
  readonly anchors: ReadonlyMap<number, Merge>
  readonly covered: ReadonlySet<number>
} {
  const anchors = new Map<number, Merge>()
  const covered = new Set<number>()
  const width = data.columns.length
  for (const merge of data.merges ?? []) {
    anchors.set(merge.row * width + merge.col, merge)
    for (let row = merge.row; row < merge.row + merge.rows; row++) {
      for (let col = merge.col; col < merge.col + merge.cols; col++) {
        if (row !== merge.row || col !== merge.col) covered.add(row * width + col)
      }
    }
  }
  return { anchors, covered }
}
