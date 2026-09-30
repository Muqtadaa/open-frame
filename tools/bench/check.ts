/**
 * Holds the nightly's measurements to their budgets (`budgets.ts`).
 *
 *   tsx tools/bench/check.ts bench-results/*.json
 *
 * Prints a table, adds it to the GitHub job summary when there is one, and
 * exits non-zero on any breach — including a budget nothing measured.
 */
import { appendFileSync, readFileSync } from 'node:fs'

import { BUDGETS, judge } from './budgets.js'
import type { Measurement } from './results.js'

const files = process.argv.slice(2)
if (files.length === 0) throw new Error('usage: check.ts <results.json>...')

const measurements = files.flatMap(
  (file) => JSON.parse(readFileSync(file, 'utf8')) as Measurement[],
)
const { rows, breaches, unbudgeted } = judge(measurements, BUDGETS)

const shown = (value: number | null, unit: string): string =>
  value === null ? '—' : unit === 'ms' ? `${value.toFixed(2)}ms` : `${String(value)} ${unit}`
const mark = { within: 'ok', over: 'OVER', missing: 'NOT MEASURED', unit: 'WRONG UNIT' } as const

const lines = [
  '### Performance budgets',
  '',
  '| metric | measured | budget | |',
  '|---|---:|---:|---|',
  ...rows.map(
    (row) =>
      `| ${row.metric} | ${shown(row.value, row.unit)} | ${shown(row.max, row.unit)} | ${mark[row.status]} |`,
  ),
  '',
  '<details><summary>Measured without a budget (the trend)</summary>',
  '',
  '| metric | measured |',
  '|---|---:|',
  ...unbudgeted.map((m) => `| ${m.metric} | ${shown(m.value, m.unit)} |`),
  '',
  '</details>',
  '',
]
const table = lines.join('\n')
console.log(table)

const summary = process.env.GITHUB_STEP_SUMMARY
if (summary !== undefined && summary !== '') appendFileSync(summary, table)

if (breaches.length > 0) {
  console.error(`${String(breaches.length)} budget(s) breached.`)
  process.exitCode = 1
}
