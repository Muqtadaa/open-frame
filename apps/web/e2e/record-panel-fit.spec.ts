import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The record panel fits the window it is in (audit 2026-09-27, P1).
 *
 * It was a fixed 360px wide with no height limit, so on a phone it ran off
 * the right edge — Delete, swatches and opacity out of reach — and covered
 * the selection's handles; on a short window, or at 200% zoom, it covered the
 * zoom cluster and its lower rows could not be reached at all.
 */
const CANVAS = '[data-testid="canvas"]'

async function selectANote(page: Page, at: { x: number; y: number }): Promise<void> {
  await page.goto(BOARD_URL)
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
    const box = await panel.boundingBox()
    if (box === null) throw new Error('no panel')
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    // Docked: along the bottom edge, and no taller than half the screen.
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(843)
    expect(box.height).toBeLessThanOrEqual(844 / 2 + 1)

    // Every control is reachable: the last one scrolls into view, inside it.
    const remove = page.getByTestId('inspector-delete')
    await remove.scrollIntoViewIfNeeded()
    const del = await remove.boundingBox()
    if (del === null) throw new Error('no delete')
    expect(del.x + del.width).toBeLessThanOrEqual(390)
    expect(del.y + del.height).toBeLessThanOrEqual(844)
  })

  test('it leaves the selection and its handles uncovered', async ({ page }) => {
    await selectANote(page, { x: 200, y: 220 })
    const handle = await page.getByTestId('handle-se').boundingBox()
    if (handle === null) throw new Error('no handle')
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
    const panel = await page.getByTestId('inspector').boundingBox()
    const zoom = await page.getByTestId('zoom-control').boundingBox()
    if (panel === null || zoom === null) throw new Error('missing')
    const overlaps =
      panel.x < zoom.x + zoom.width &&
      zoom.x < panel.x + panel.width &&
      panel.y < zoom.y + zoom.height &&
      zoom.y < panel.y + panel.height
    expect(overlaps).toBe(false)
    expect(panel.y + panel.height).toBeLessThanOrEqual(400)

    const opacity = page.getByTestId('inspector').getByRole('slider').last()
    await opacity.scrollIntoViewIfNeeded()
    const slider = await opacity.boundingBox()
    if (slider === null) throw new Error('no slider')
    expect(slider.y + slider.height).toBeLessThanOrEqual(panel.y + panel.height + 1)
  })
})
