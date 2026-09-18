import { expect, test } from '@playwright/test'

/**
 * The brand surfaces: the boot splash and the two worlds.
 *
 * Both belong in the browser suite for the same reason: neither exists in a
 * unit test. The splash is markup in `index.html` that a module removes after
 * two animation frames, and a theme is `data-theme` surviving a real reload
 * through real storage.
 */

const STATUS_BAR = '[data-testid="status-bar"]'
const TOGGLE = '[data-testid="theme-toggle"]'

test.describe('the boot splash', () => {
  test('covers the wait, then gets out of the way', async ({ page }) => {
    /*
     * Held open by delaying the entry module — the actual gap the splash exists
     * to cover, rather than a simulation of it.
     */
    let held = false
    await page.route('**/main.tsx*', async (route) => {
      held = true
      await new Promise((resolve) => setTimeout(resolve, 1200))
      await route.continue()
    })

    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.locator('#of-splash')).toBeVisible()
    expect(held).toBe(true)

    await page.waitForSelector(STATUS_BAR, { timeout: 20_000 })
    // Removed, not merely transparent: an invisible full-screen sheet would
    // swallow every click on the board underneath it.
    await expect(page.locator('#of-splash')).toHaveCount(0, { timeout: 5_000 })
  })

  /**
   * The application's status region is the toast, and exactly one thing may
   * hold that role. A splash that also claimed it put two live regions in
   * competition — caught when the SVG-rejection spec started resolving two
   * elements instead of one.
   */
  test('does not compete with the toast for the status role', async ({ page }) => {
    await page.route('**/main.tsx*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 900))
      await route.continue()
    })
    await page.goto('/', { waitUntil: 'commit' })
    await expect(page.locator('#of-splash')).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
  })
})

test.describe('after hours', () => {
  test('switches worlds and is still there after a reload', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector(STATUS_BAR)

    const root = page.locator('html')
    await expect(root).not.toHaveAttribute('data-theme', /.*/)
    await expect(page.locator(TOGGLE)).toHaveAttribute('aria-pressed', 'false')

    await page.click(TOGGLE)
    await expect(root).toHaveAttribute('data-theme', 'after-hours')
    await expect(page.locator(TOGGLE)).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await page.waitForSelector(STATUS_BAR)
    await expect(root).toHaveAttribute('data-theme', 'after-hours')
    await expect(page.locator(TOGGLE)).toHaveAttribute('aria-pressed', 'true')
  })

  test('switches back, and the default world carries no attribute at all', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector(STATUS_BAR)
    await page.click(TOGGLE)
    await page.click(TOGGLE)

    /*
     * Absent rather than `data-theme="notebook"`. The base `:root` block is what
     * defines the default world; an attribute for it would make two selectors
     * responsible for one palette.
     */
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
    await page.reload()
    await page.waitForSelector(STATUS_BAR)
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
  })

  test('repaints the board, not just the chrome', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector(STATUS_BAR)

    const pageColour = async (): Promise<string> =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor)

    const notebook = await pageColour()
    await page.click(TOGGLE)
    const afterHours = await pageColour()

    expect(afterHours).not.toBe(notebook)
    // Dark, and by a wide margin — a theme that merely tinted would pass a
    // bare inequality check.
    const luminance = (colour: string): number => {
      const [r, g, b] = (/(\d+), (\d+), (\d+)/.exec(colour) ?? []).slice(1).map(Number) as [
        number,
        number,
        number,
      ]
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    expect(luminance(afterHours)).toBeLessThan(60)
    expect(luminance(notebook)).toBeGreaterThan(180)
  })
})
