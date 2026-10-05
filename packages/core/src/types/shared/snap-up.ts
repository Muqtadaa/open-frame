/**
 * A size made from content, rounded UP to the board's 10-unit grid, so a
 * pasted object lands on the grid the way a drawn one does — and never
 * smaller than what it was sized to hold.
 */
export function snapUp(size: number): number {
  return Math.ceil(size / 10) * 10
}
