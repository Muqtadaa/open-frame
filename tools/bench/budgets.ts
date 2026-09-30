/**
 * What the nightly holds the benchmarks to.
 *
 * Every limit here is a limit the PRODUCT has, never "today's number plus a
 * margin". Milliseconds differ about twofold between machines — a cull of
 * `board-mixed-10000` measured 3.1ms where rule 10 was written and 5–8ms in the
 * development sandbox, on the very same commit — so a budget tied to one
 * machine's reading either fails on a slower runner or passes a real
 * regression on a faster one. A frame is a frame on any machine.
 *
 * Map copies do not vary with the machine at all, so they are held EXACTLY to
 * what the code does now: a new copy per command is the regression rule 10
 * describes, and it shows up here as a count before it shows up as time.
 */
import type { Measurement } from './results.js'

export interface Budget {
  readonly metric: string
  readonly max: number
  readonly unit: Measurement['unit']
  /** Where the limit comes from — a budget nobody can justify gets loosened. */
  readonly why: string
}

export interface Row {
  readonly metric: string
  readonly value: number | null
  readonly max: number
  readonly unit: Measurement['unit']
  readonly status: 'within' | 'over' | 'missing' | 'unit'
}

const FRAME = 16.7

export const BUDGETS: readonly Budget[] = [
  {
    metric: 'cull/board-mixed-10000',
    max: FRAME,
    unit: 'ms',
    why: 'a cull runs inside a frame; the group bug of rule 10 cost 9.6ms on a fast machine',
  },
  {
    metric: 'cull/board-10000',
    max: FRAME / 4,
    unit: 'ms',
    why: 'sticky notes only: the cheapest bounds there are, so a quarter of a frame is generous',
  },
  {
    metric: 'relations/board-mixed-10000',
    max: FRAME,
    unit: 'ms',
    why: 'ADR 0011: 200 reverse lookups on a cold index, the first query after any edit',
  },
  ...['get_objects, first page', 'get_objects, page 10 by cursor', 'search_board, common word'].map(
    (name): Budget => ({
      metric: `mcp/board-mixed-10000/${name}`,
      max: 50,
      unit: 'ms',
      why: 'P2: an MCP read over 50ms per call at 10k is material',
    }),
  ),
  {
    metric: 'mcp/board-mixed-10000/peer: that batch arriving remotely',
    max: FRAME,
    unit: 'ms',
    why: "P2: a remote batch blocks every other peer's frame",
  },
  {
    metric: 'mcp/board-mixed-10000/agent: 200 commands, one transaction',
    max: 100,
    unit: 'ms',
    why: 'P2 took it from 406ms to 24ms; the copies below are the exact guard, this the backstop',
  },
  {
    metric: 'copies/board-mixed-10000/agent: 200 commands, one transaction',
    max: 3,
    unit: 'copies',
    why: 'rule 10: a transaction copies the map once, not once per command (it was 202)',
  },
  {
    metric: 'copies/board-mixed-10000/peer: that batch arriving remotely',
    max: 4,
    unit: 'copies',
    why: 'what a remote batch costs today; one more per peer is a regression',
  },
  ...['get_objects, first page', 'search_board, common word'].map((name): Budget => ({
    metric: `copies/board-mixed-10000/${name}`,
    max: 0,
    unit: 'copies',
    why: 'a read never copies the board',
  })),
]

/**
 * Each budget against its measurement. A budget nothing measured FAILS: a
 * renamed metric or a benchmark that quietly stopped running would otherwise
 * read as "within budget" for ever. A measurement with no budget is only
 * reported — it is the trend, not a gate.
 */
export function judge(
  measurements: readonly Measurement[],
  budgets: readonly Budget[],
): { rows: Row[]; breaches: Row[]; unbudgeted: Measurement[] } {
  const byMetric = new Map(measurements.map((m) => [m.metric, m]))
  const rows = budgets.map((budget): Row => {
    const found = byMetric.get(budget.metric)
    const base = { metric: budget.metric, max: budget.max, unit: budget.unit }
    if (found === undefined) return { ...base, value: null, status: 'missing' }
    if (found.unit !== budget.unit) return { ...base, value: found.value, status: 'unit' }
    return { ...base, value: found.value, status: found.value <= budget.max ? 'within' : 'over' }
  })
  const budgeted = new Set(budgets.map((budget) => budget.metric))
  return {
    rows,
    breaches: rows.filter((row) => row.status !== 'within'),
    unbudgeted: measurements.filter((m) => !budgeted.has(m.metric)),
  }
}
