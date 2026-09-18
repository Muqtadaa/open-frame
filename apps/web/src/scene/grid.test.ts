import { describe, expect, it } from 'vitest'

import { gridStyle } from './grid.js'
import { MAX_ZOOM, MIN_ZOOM } from '@openframe/core'

import { ZOOM_STEPS } from './zoom.js'

/** Every `Npx Npx` in a background-size list, as numbers. */
function cells(zoom: number): number[] {
  const style = gridStyle({ x: 0, y: 0, zoom })
  return [...style.backgroundSize.matchAll(/([\d.]+)px [\d.]+px/g)].map((m) => Number(m[1]))
}

interface Rule {
  readonly cell: number
  readonly alpha: number
}

/**
 * What a viewer actually sees: each rule's cell size paired with its opacity,
 * keeping only the ones dark enough to register.
 *
 * Compared as a SET rather than by layer index. When the zoom crosses a decade
 * the layers shift along by one — what was the middle layer becomes the finest
 * — so index-by-index comparison reports a tenfold jump at every rollover even
 * though nothing on screen has moved. That was this test's first version, and
 * it failed on correct output.
 */
function visibleRules(zoom: number): Rule[] {
  const style = gridStyle({ x: 0, y: 0, zoom })
  const sizes = cells(zoom)
  /*
   * `...var(--of-rule)) 92%, transparent)` — the percentage follows a closing
   * parenthesis, not a comma, because the ink is itself a nested color-mix.
   * A first version of this pattern expected a comma, matched nothing, and
   * left every rule looking invisible — so the sweep below compared two empty
   * sets and passed against the exact behaviour it exists to catch.
   */
  const alphas = [...style.backgroundImage.matchAll(/\) (\d+)%, transparent\)/g)].map((m) =>
    Number(m[1]),
  )
  return sizes
    .map((cell, index) => ({ cell, alpha: (alphas[index] ?? 0) / 100 }))
    .filter((rule) => rule.alpha > 0.02)
}

/** Every mixed-in percentage, which is each layer's opacity then its weight. */
function paints(zoom: number): string {
  return gridStyle({ x: 0, y: 0, zoom }).backgroundImage
}

describe('the ruled ground', () => {
  /**
   * The failure this replaces: the fine rule switched on at 70% zoom and a
   * century rule took over below 12%, so scrolling through either point made
   * the board jump between two visibly different pages.
   *
   * Continuity is asserted as a property over a dense sweep rather than at the
   * two zooms that used to break, because the next version of this bug will be
   * at a different zoom.
   */
  it('never changes abruptly as the zoom sweeps', () => {
    let previous = visibleRules(MIN_ZOOM)
    for (let zoom = MIN_ZOOM * 1.01; zoom <= MAX_ZOOM; zoom *= 1.01) {
      const current = visibleRules(zoom)
      /*
       * Checked in BOTH directions over the union of the two frames. The first
       * version of this test only walked the rules that had been visible, so a
       * rule appearing from nothing at full darkness was invisible to it — and
       * it passed against the hard-threshold behaviour it was written to catch.
       * A vacuous test is worse than none, because it is trusted (rule 23).
       */
      const alphaAt = (rules: Rule[], cell: number): number =>
        rules.find((rule) => Math.abs(rule.cell - cell) / cell < 0.05)?.alpha ?? 0

      for (const rule of [...previous, ...current]) {
        expect(
          Math.abs(alphaAt(current, rule.cell) - alphaAt(previous, rule.cell)),
          `a rule at ${String(Math.round(rule.cell))}px jumped at zoom ${zoom.toFixed(3)}`,
        ).toBeLessThan(0.1)
      }
      previous = current
    }
  })

  /**
   * The board is a ruled page at every zoom a user can reach. Two weights once
   * dropped out below 12% and left a flat unruled void — the neutral canvas
   * this design exists to refuse, appearing exactly when someone zooms out to
   * survey the whole record.
   */
  it('rules the page at every reachable zoom', () => {
    for (const zoom of [MIN_ZOOM, ...ZOOM_STEPS, MAX_ZOOM]) {
      const drawn = cells(zoom)
      expect(drawn.length, `nothing drawn at ${String(zoom)}`).toBeGreaterThanOrEqual(2)
      // Nothing so fine it reads as a wash, nor so coarse it reads as tiles.
      for (const cell of drawn) expect(cell).toBeGreaterThan(1)
    }
  })

  /** Ruling is geometry, not decoration: no literal colour may appear here. */
  it('paints only with tokens', () => {
    const image = paints(1)
    expect(image).toContain('var(--of-rule)')
    expect(/#[0-9a-f]{3,8}|rgba?\(/i.test(image)).toBe(false)
  })

  /**
   * A layer's ink follows its CELL SIZE, so the level carrying the page reads
   * the same before and after a decade rolls over. Assigning weight by level
   * index instead would pop at exactly the rollover the fade exists to smooth.
   */
  it('darkens a rule as its cells grow', () => {
    const image = paints(1)
    const weights = [...image.matchAll(/--of-rule-decade\) (\d+)%/g)].map((m) => Number(m[1]))
    expect(weights.length).toBeGreaterThanOrEqual(2)
    expect([...weights].sort((a, b) => a - b)).toEqual(weights)
  })
})
