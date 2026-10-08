/**
 * What each route makes a browser download before it can show anything: the
 * entry chunk, the route's own chunk, and every chunk either imports
 * statically, compressed as they are served.
 *
 *   tsx tools/bench/bundle-size.ts [--json <path>] [--check]
 *
 * Read from Vite's manifest of the last `pnpm build`, so it measures the build
 * that ships rather than an estimate. Bytes do not vary with the machine, so
 * `--check` holds them to their budgets in `pnpm verify` itself, not only in
 * the nightly: the entry chunk grew by a quarter in a month and nothing said
 * so until an audit read the build (audit 2026-10-08).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

import { BUDGETS, judge } from './budgets.js'
import { jsonTarget, writeMeasurements, type Measurement } from './results.js'

export interface ManifestChunk {
  readonly file: string
  readonly isEntry?: boolean
  readonly imports?: readonly string[]
}

export type Manifest = Readonly<Record<string, ManifestChunk>>

/**
 * The chunks a browser loads to run `from`: each one and everything it imports
 * statically. Dynamic imports are left out — they are what loads on request.
 */
export function firstLoad(manifest: Manifest, from: readonly string[]): Set<string> {
  const seen = new Set<string>()
  const visit = (key: string): void => {
    if (seen.has(key)) return
    const chunk = manifest[key]
    if (chunk === undefined) throw new Error(`the manifest has no chunk ${key}`)
    seen.add(key)
    for (const next of chunk.imports ?? []) visit(next)
  }
  for (const key of from) visit(key)
  return seen
}

/** The routes, as the source file each one starts from after the entry. */
export const ROUTES = {
  'front-door': 'src/ui/Home.tsx',
  board: 'src/app/open-board.tsx',
} as const

function main(): void {
  const dist = join(import.meta.dirname, '../../apps/web/dist')
  const path = join(dist, '.vite/manifest.json')
  if (!existsSync(path)) throw new Error(`no manifest at ${path}: run pnpm build first`)
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest
  const entry = Object.keys(manifest).find((key) => manifest[key]?.isEntry === true)
  if (entry === undefined) throw new Error('the manifest names no entry')

  const kB = (keys: ReadonlySet<string>): number => {
    let bytes = 0
    for (const key of keys) {
      const file = manifest[key]?.file ?? ''
      bytes += gzipSync(readFileSync(join(dist, file))).length
    }
    return Math.round(bytes / 102.4) / 10
  }

  const measurements: Measurement[] = Object.entries(ROUTES).map(([route, source]) => ({
    metric: `bundle/${route}`,
    value: kB(firstLoad(manifest, [entry, source])),
    unit: 'kB',
  }))
  for (const m of measurements) console.log(`${m.metric.padEnd(20)} ${m.value.toFixed(1)} kB gzip`)

  const target = jsonTarget(process.argv)
  if (target !== null) writeMeasurements(target, measurements)

  if (process.argv.includes('--check')) {
    const { breaches } = judge(
      measurements,
      BUDGETS.filter((budget) => budget.metric.startsWith('bundle/')),
    )
    for (const row of breaches) {
      console.error(`${row.metric}: ${String(row.value)} kB against ${String(row.max)} kB`)
    }
    if (breaches.length > 0) process.exitCode = 1
  }
}

if (process.argv[1] !== undefined && import.meta.filename === process.argv[1]) main()
