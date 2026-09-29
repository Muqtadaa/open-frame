import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * A rail too long for its window says there is more of it (audit 2026-09-27).
 *
 * At 844×390 it scrolled with nothing to show it — a phone draws no scrollbar
 * — so Connect, Table, Code, Image and Comment were simply not there for
 * anybody who did not think to drag the rail.
 */
// Local rather than the shared fixture: it waits for the status bar, not the canvas and rail.
async function open(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
}

const marks = (page: Page) =>
  page.locator('.of-rail').evaluate((rail) => ({
    before: rail.hasAttribute('data-more-before'),
    after: rail.hasAttribute('data-more-after'),
    fade: getComputedStyle(rail, '::after').content !== 'none',
  }))

test.describe('a phone held sideways', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true })

  test('the rail says there is more below, then more above', async ({ page }) => {
    await open(page)
    const rail = page.locator('.of-rail')
    // Not vacuous: at this size the rail really does scroll.
    const overflow = await rail.evaluate((element) => element.scrollHeight - element.clientHeight)
    expect(overflow).toBeGreaterThan(40)

    expect(await marks(page)).toEqual({ before: false, after: true, fade: true })

    await rail.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect.poll(() => marks(page)).toEqual({ before: true, after: false, fade: false })
  })
})

test.describe('a rail that fits', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('says nothing about more', async ({ page }) => {
    await open(page)
    expect(await marks(page)).toEqual({ before: false, after: false, fade: false })
  })
})

/*
 * A finger's tools are 40px wherever a mouse's are 30, so the heights at which
 * the rail steps down — worked out for a mouse — no longer say when it fits.
 * At every height it either fits inside the window or scrolls; it never runs
 * off the bottom.
 */
test.describe('under a finger, at every height', () => {
  test.use({ hasTouch: true, isMobile: true })

  for (const height of [390, 440, 500, 560, 620, 680, 740]) {
    test(`the rail stays on screen at ${String(height)}px`, async ({ page }) => {
      await page.setViewportSize({ width: 844, height })
      await open(page)
      const box = await page.locator('.of-rail').boundingBox()
      expect(box).not.toBeNull()
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height)
      // A rail that is cut off must scroll; one that fits need not.
      const reachable = await page
        .getByRole('toolbar', { name: 'Board tools' })
        .evaluate(
          (rail) =>
            rail.scrollHeight <= rail.clientHeight + 1 ||
            getComputedStyle(rail).overflowY !== 'visible',
        )
      expect(reachable, 'the rail is cut off and cannot scroll').toBe(true)
    })
  }
})
