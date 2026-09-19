import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The ADR 0002 gate, instrumented.
 *
 * Measures what culling actually does at each board size: how many DOM nodes
 * exist, how long a load takes, and frame timing while panning. Reports rather
 * than asserts — except for the one property the whole DOM-renderer strategy
 * depends on, which is asserted.
 *
 * Run `pnpm bench:fixtures` first. Headless timings understate real hardware and
 * overstate consistency; treat them as a smoke signal, not a verdict.
 */

const SIZES = [100, 1_000, 5_000, 10_000] as const

/**
 * Two compositions, because they measure different things.
 *
 * `board` is sticky notes only: bounds are four numbers off the frame, the
 * cheapest case there is. `board-mixed` adds shapes, groups whose bounds are the
 * union of their children's, and connectors that resolve their endpoints
 * through the document on every bounds call. A flat frame time on the first
 * says nothing about the second, which is where the cost actually is.
 */
const BOARDS = ['board', 'board-mixed'] as const

interface Measurement {
  readonly board: string
  readonly size: number
  readonly loadMs: number
  readonly domNodes: number
  readonly visible: number
  readonly panP50: number
  readonly panP95: number
}

async function loadFixture(page: Page, board: string, size: number): Promise<number> {
  return page.evaluate(
    async ({ board: name, count }: { board: string; count: number }) => {
      const w = window as unknown as {
        __openframe: { runtime: { devTools?: { loadBoard(raw: unknown): { ok: boolean } } } }
      }
      const raw: unknown = await (await fetch(`/bench/${name}-${String(count)}.json`)).json()
      const started = performance.now()
      w.__openframe.runtime.devTools?.loadBoard(raw)
      return performance.now() - started
    },
    { board, count: size },
  )
}

/** Pans across the board while sampling frame times. */
async function measurePan(page: Page): Promise<{ p50: number; p95: number }> {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[] }
    w.__frames = []
    let previous = performance.now()
    const tick = (now: number): void => {
      w.__frames.push(now - previous)
      previous = now
      if (w.__frames.length < 200) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await page.mouse.move(640, 400)
  await page.mouse.down({ button: 'middle' })
  for (let step = 0; step < 40; step++) {
    await page.mouse.move(640 - step * 12, 400 - step * 6)
  }
  await page.mouse.up({ button: 'middle' })
  await page.waitForTimeout(400)

  return page.evaluate(() => {
    const frames = (window as unknown as { __frames: number[] }).__frames
    const sorted = [...frames].sort((a, b) => a - b)
    const at = (q: number): number =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0
    return { p50: Math.round(at(0.5) * 10) / 10, p95: Math.round(at(0.95) * 10) / 10 }
  })
}

test('renderer scaling probe', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto(BOARD_URL)
  await expect(page.locator('[data-testid="canvas"]')).toBeVisible()

  const results: Measurement[] = []

  for (const board of BOARDS) {
    for (const size of SIZES) {
      const loadMs = await loadFixture(page, board, size)
      await page.waitForTimeout(500)

      const visible = Number(
        (await page.locator('.of-object-layer').getAttribute('data-visible-count')) ?? '0',
      )
      const domNodes = await page.locator('.of-object').count()
      const { p50, p95 } = await measurePan(page)

      results.push({
        board,
        size,
        loadMs: Math.round(loadMs),
        domNodes,
        visible,
        panP50: p50,
        panP95: p95,
      })
    }
  }

  console.log('\n  board        | objects |  load |  DOM nodes | visible | pan p50 | pan p95')
  console.log('  -------------|---------|-------|------------|---------|---------|--------')
  for (const r of results) {
    console.log(
      `  ${r.board.padEnd(12)} | ${String(r.size).padStart(7)} | ${String(r.loadMs).padStart(4)}ms | ` +
        `${String(r.domNodes).padStart(10)} | ${String(r.visible).padStart(7)} | ` +
        `${String(r.panP50).padStart(6)}ms | ${String(r.panP95).padStart(6)}ms`,
    )
  }
  console.log()

  /*
   * THE property the DOM-renderer strategy depends on: node count must track
   * what is on screen, not what exists. If a 10,000-object board mounts
   * meaningfully more nodes than a 1,000-object board at the same zoom, culling
   * is not working and ADR 0002's premise is false.
   */
  for (const board of BOARDS) {
    const small = results.find((r) => r.board === board && r.size === 1_000)
    const large = results.find((r) => r.board === board && r.size === 10_000)
    expect(small, board).toBeDefined()
    expect(large, board).toBeDefined()
    if (small === undefined || large === undefined) continue
    expect(large.domNodes, board).toBeLessThan(small.domNodes * 2)
  }
})
