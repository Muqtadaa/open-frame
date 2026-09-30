import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { judge, type Budget } from './budgets.js'
import type { Measurement } from './results.js'

const budget: Budget = { metric: 'cull/board-mixed-10000', max: 16.7, unit: 'ms', why: 'a frame' }

const measured = (value: number): Measurement => ({
  metric: 'cull/board-mixed-10000',
  value,
  unit: 'ms',
})

void describe('holding a benchmark to its budget', () => {
  void it('passes a measurement inside its budget, and says by how much', () => {
    const verdict = judge([measured(7.5)], [budget])
    assert.equal(verdict.breaches.length, 0)
    assert.equal(verdict.rows[0]?.status, 'within')
  })

  void it('fails one over it', () => {
    const verdict = judge([measured(20)], [budget])
    assert.deepEqual(
      verdict.breaches.map((row) => row.metric),
      ['cull/board-mixed-10000'],
    )
  })

  void it('fails a budget nothing measured, which would otherwise pass forever', () => {
    // A renamed metric or a benchmark that stopped running must not read as
    // "within budget": that is the vacuous pass rule 23 exists to prevent.
    const verdict = judge([], [budget])
    assert.equal(verdict.breaches[0]?.status, 'missing')
  })

  void it('fails a measurement in a different unit from its budget', () => {
    const verdict = judge([{ ...measured(3), unit: 'copies' }], [budget])
    assert.equal(verdict.breaches[0]?.status, 'unit')
  })

  void it('reports a measurement with no budget without failing on it', () => {
    const verdict = judge(
      [measured(5), { metric: 'load/board-10000', value: 900, unit: 'ms' }],
      [budget],
    )
    assert.equal(verdict.breaches.length, 0)
    assert.deepEqual(verdict.unbudgeted, [{ metric: 'load/board-10000', value: 900, unit: 'ms' }])
  })
})
