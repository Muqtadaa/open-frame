import type { Page } from '@playwright/test'

import { buildBoard } from './boards.js'
import { boxOf, CANVAS, clickLine, goto, overlaps, seedBoard, test, expect } from './fixtures.js'
import { BOARD_URL } from './routes.js'

/**
 * The record panel fits the window it is in (audit 2026-09-27, P1).
 *
 * It was a fixed 360px wide with no height limit, so on a phone it ran off
 * the right edge — Delete, swatches and opacity out of reach — and covered
 * the selection's handles; on a short window, or at 200% zoom, it covered the
 * zoom cluster and its lower rows could not be reached at all.
 */

async function selectANote(page: Page, at: { x: number; y: number }): Promise<void> {
  await goto(page, BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: at })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('inspector')).toBeVisible()
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('it is a sheet along the bottom, inside the screen, that scrolls', async ({ page }) => {
    await selectANote(page, { x: 200, y: 220 })
    const panel = page.getByTestId('inspector')
    const box = await boxOf(panel)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    // Docked: along the bottom edge, and no taller than half the screen.
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843)
    expect(box.height).toBeLessThanOrEqual(844 / 2 + 1)

    // Every control is reachable: the last one scrolls into view, inside it.
    const remove = page.getByTestId('inspector-delete')
    await remove.scrollIntoViewIfNeeded()
    const del = await boxOf(remove)
    expect(del.x + del.width).toBeLessThanOrEqual(390)
    expect(del.y + del.height).toBeLessThanOrEqual(844)
  })

  test('it leaves the selection and its handles uncovered', async ({ page }) => {
    await selectANote(page, { x: 200, y: 220 })
    const handle = await boxOf(page.getByTestId('handle-se'))
    const topmost = await page.evaluate(
      ([x, y]) =>
        document
          .elementFromPoint(x ?? 0, y ?? 0)
          ?.closest('[data-testid]')
          ?.getAttribute('data-testid'),
      [handle.x + handle.width / 2, handle.y + handle.height / 2],
    )
    expect(topmost).toBe('handle-se')
  })
})

test.describe('on a short window', () => {
  // What 1280x800 at 200% zoom lays out as.
  test.use({ viewport: { width: 640, height: 400 } })

  test('it stays clear of the zoom cluster and scrolls to its last row', async ({ page }) => {
    await selectANote(page, { x: 300, y: 160 })
    const panel = await boxOf(page.getByTestId('inspector'))
    const zoom = await boxOf(page.getByTestId('zoom-control'))
    expect(overlaps(panel, zoom)).toBe(false)
    expect(panel.y + panel.height).toBeLessThanOrEqual(400)

    const opacity = page.getByTestId('inspector').getByRole('slider').last()
    await opacity.scrollIntoViewIfNeeded()
    const slider = await boxOf(opacity)
    expect(slider.y + slider.height).toBeLessThanOrEqual(panel.y + panel.height + 1)
  })
})

test.describe('beside the rest of what floats over the board', () => {
  test.use({ board: 'fresh' })

  test('a line’s panel keeps clear of the notes it joins', async ({ page }) => {
    await seedBoard(
      page,
      buildBoard((board) => {
        const a = board.note('A', { x: 300, y: 300 })
        const b = board.note('B', { x: 700, y: 300 })
        board.connect(a, b)
      }),
    )
    await clickLine(page)
    const panel = await boxOf(page.getByTestId('inspector'))
    // The line's own box ends where the notes begin; a panel placed beside
    // it alone landed on the note it points at, with room to spare past it.
    // (Where the notes span the window there is no such room, and the panel
    // covers as little as it can — that is the placement's own fallback.)
    for (const note of await page.locator('[data-object-type="sticky"]').all()) {
      expect(overlaps(panel, await boxOf(note)), 'the panel covers a joined note').toBe(false)
    }
  })

  test('the arrange bar keeps off the panel in a short window', async ({ page }) => {
    // Short enough that the panel takes the right of the bands above AND
    // below the selection. (At 760 wide the gap between the rail's band and
    // the panel is 280px for a 286px bar: there, no placement can clear it.)
    await page.setViewportSize({ width: 800, height: 560 })
    await seedBoard(
      page,
      buildBoard((board) => {
        board.note('A', { x: 300, y: 300 })
        board.note('B', { x: 520, y: 320 })
      }),
    )
    await page.keyboard.press('ControlOrMeta+a')
    const bar = await boxOf(page.getByTestId('arrange-bar'))
    const panel = await boxOf(page.getByTestId('inspector'))
    expect(overlaps(bar, panel), 'the arrange bar lies on the record panel').toBe(false)
  })
})
