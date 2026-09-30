/**
 * What a benchmark measured, in a form the budget check can read.
 *
 * The benchmarks print tables for a person; the nightly also needs the numbers
 * as data, to hold them to a budget and to keep them as a trend. A script
 * writes its results where `--json <path>` says, and nowhere otherwise, so an
 * interactive run is unchanged.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Measurement {
  /** Stable across runs, so a trend can follow it: `cull/board-mixed-10000`. */
  readonly metric: string
  readonly value: number
  readonly unit: 'ms' | 'copies' | 'nodes'
}

/** The path after `--json`, if the script was asked for one. */
export function jsonTarget(argv: readonly string[]): string | null {
  const at = argv.indexOf('--json')
  if (at === -1) return null
  const path = argv[at + 1]
  if (path === undefined || path.startsWith('--')) throw new Error('--json needs a file path')
  return path
}

export function writeMeasurements(path: string, measurements: readonly Measurement[]): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(measurements, null, 2)}\n`)
}
