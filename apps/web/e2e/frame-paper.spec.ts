import { expect, test, type Page } from '@playwright/test'

import { CANVAS, viewOf } from './fixtures.js'
import { BOARD_URL } from './routes.js'

/**
 * A frame nobody has coloured is laid on the world's paper (audit 2026-09-27).
 *
 * After Hours it was white paper under a lamp — dimmed, and still a bright
 * slab the size of a region of the board, under everything placed on it. It
 * is the panel stock at night now; by day it is white, as it always was. A
 * white somebody CHOSE stays white in both.
 */
const EDITOR = '[contenteditable="true"]'

async function placeFrame(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
  await page.keyboard.press('f')
  await page.locator(CANVAS).click({ position: { x: 500, y: 350 } })
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(viewOf(page, 'frame')).toHaveCount(1)
}

const paper = (page: Page) =>
  viewOf(page, 'frame').evaluate((frame) => getComputedStyle(frame).backgroundColor)

const token = (page: Page, name: string) =>
  page.evaluate(
    (name) =>
      // Resolved through an element, so the answer is a computed rgb() like the
      // frame's rather than the stylesheet's hex.
      (() => {
        const probe = document.createElement('div')
        probe.style.background = `var(--of-${name})`
        document.body.append(probe)
        const colour = getComputedStyle(probe).backgroundColor
        probe.remove()
        return colour
      })(),
    name,
  )

test.describe('after hours', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('openframe:theme', 'after-hours')
    })
  })

  test('an uncoloured frame is the panel stock, not white paper', async ({ page }) => {
    await placeFrame(page)
    expect(await paper(page)).toBe(await token(page, 'panel'))
    expect(await paper(page)).not.toBe(await token(page, 's-white'))
  })

  test('marks no colour for it, and a chosen white is white', async ({ page }) => {
    await placeFrame(page)
    await page.getByTestId('frame-title').click()
    await expect(page.getByTestId('inspector')).toBeVisible()
    // No swatch is what it is drawn in, so none claims to be.
    await expect(page.locator('[data-testid^="swatch-"][aria-pressed="true"]')).toHaveCount(0)

    await page.getByTestId('swatch-white').click()
    await expect(page.getByTestId('swatch-white')).toHaveAttribute('aria-pressed', 'true')
    expect(await paper(page)).toBe(await token(page, 's-white'))
  })
})

test('by day an uncoloured frame is still white paper', async ({ page }) => {
  await placeFrame(page)
  expect(await paper(page)).toBe('rgb(255, 255, 255)')
})
