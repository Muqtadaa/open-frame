import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL, HOME_URL } from './routes.js'

/**
 * Naming a board.
 *
 * Until this existed, every board was called "Untitled board" and the board
 * list was a column of identical rows — a surface that is real and useless at
 * the same time. So the assertion that matters most here is the last one: the
 * name reaches the list.
 */

const TITLE = '[data-testid="board-title"]'
const INPUT = '[data-testid="board-title-input"]'

async function rename(page: Page, to: string): Promise<void> {
  await page.locator(TITLE).click()
  await page.locator(INPUT).fill(to)
  await page.locator(INPUT).press('Enter')
}

test.beforeEach(async ({ page }) => {
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
})

test.describe('the board name', () => {
  test('starts as the default and becomes what you type', async ({ page }) => {
    await expect(page.locator(TITLE)).toHaveText('Untitled board')

    await rename(page, 'Pricing research')

    await expect(page.locator(TITLE)).toHaveText('Pricing research')
  })

  test('survives a reload', async ({ page }) => {
    await rename(page, 'Pricing research')

    await page.waitForTimeout(800) // autosave is debounced
    await page.reload()
    await page.waitForSelector('[data-testid="status-bar"]')

    await expect(page.locator(TITLE)).toHaveText('Pricing research')
  })

  test('is undone in one press', async ({ page }) => {
    await rename(page, 'Pricing research')

    await page.keyboard.press('ControlOrMeta+z')

    await expect(page.locator(TITLE)).toHaveText('Untitled board')
  })

  test('is left alone by Escape', async ({ page }) => {
    await page.locator(TITLE).click()
    await page.locator(INPUT).fill('Never mind')
    await page.locator(INPUT).press('Escape')

    await expect(page.locator(TITLE)).toHaveText('Untitled board')
  })

  /**
   * The canvas keymap claims single letters for tools. Without the keydown
   * being stopped at the input, naming a board "Sticky" would place four
   * objects on it.
   */
  test('does not drive the canvas while being typed', async ({ page }) => {
    const before = await page.evaluate(
      () =>
        (window as unknown as { __openframe: { runtime: { store: { getDocument(): { objects: ReadonlyMap<string, unknown> } } } } }).__openframe.runtime.store.getDocument()
          .objects.size,
    )

    await page.locator(TITLE).click()
    await page.locator(INPUT).fill('Sticky text shape frame')
    await page.locator(INPUT).press('Enter')

    const after = await page.evaluate(
      () =>
        (window as unknown as { __openframe: { runtime: { store: { getDocument(): { objects: ReadonlyMap<string, unknown> } } } } }).__openframe.runtime.store.getDocument()
          .objects.size,
    )
    expect(after).toBe(before)
  })

  test('refuses an empty name and keeps the one it had', async ({ page }) => {
    await page.locator(TITLE).click()
    await page.locator(INPUT).fill('   ')
    await page.locator(INPUT).press('Enter')

    await expect(page.locator(TITLE)).toHaveText('Untitled board')
  })

  /** The whole reason renaming exists. */
  test('is what the board list shows', async ({ page }) => {
    await rename(page, 'Pricing research')

    await page.waitForTimeout(800) // autosave is debounced
    await page.goto(HOME_URL)

    await expect(page.getByTestId('home-boards')).toContainText('Pricing research')
  })
})

/**
 * The zoom controls stay clickable, whatever the record line is carrying.
 *
 * The record line is bottom-left and the zoom cluster is bottom-right, and the
 * only thing keeping them apart was that the line happened to be short enough.
 * Adding the board's name took the last 31px of clearance: the dev panel's
 * button came to rest ON TOP of the zoom controls and silently swallowed every
 * click aimed at them. Nothing failed except one unrelated test about the
 * scroll-wheel preference, thirty seconds at a time.
 *
 * The FIRST guard written for this compared bounding boxes, and it was not
 * enough twice over. A flex child refuses to shrink below its content and
 * simply overflows a capped box, so the line measured perfectly inside its
 * limit while its contents sat 21px past it — and once those contents are
 * clipped, their rectangles still report the old position anyway.
 *
 * So this asks the question that actually broke: is the thing under the
 * pointer the control you were aiming at?
 */
test('nothing covers the zoom controls', async ({ page }) => {
  await rename(page, 'A board name long enough to push this line right across the screen')

  const covered = await page.evaluate(() => {
    const zoom = document.querySelector('.of-zoom')
    if (zoom === null) return ['no zoom cluster']

    const blocked: string[] = []
    for (const control of zoom.querySelectorAll('button, input')) {
      const box = control.getBoundingClientRect()
      const at = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      if (at === null || !zoom.contains(at)) {
        blocked.push(`${control.className} is under ${String(at?.className ?? 'nothing')}`)
      }
    }
    return blocked
  })

  expect(covered).toEqual([])
})

/**
 * A right-click near the bottom of the window.
 *
 * The context menu was placed at the pointer and never clamped, so its lower
 * entries fell off-screen — unreachable, and silent about it. That was true at
 * every size; giving the rows a real target is what finally made it visible,
 * as two suites timing out for thirty seconds each on an item nobody could
 * have clicked either.
 */
test('the context menu stays on screen near the bottom edge', async ({ page }) => {
  const canvas = page.locator('[data-testid="canvas"]')
  const box = await canvas.boundingBox()
  expect(box).not.toBeNull()
  if (box === null) return

  /*
   * Low enough that a menu placed at the pointer runs off the bottom, but
   * clear of the record line — which sits in the last 60px and would swallow
   * the right-click before the canvas ever saw it.
   */
  await canvas.click({ button: 'right', position: { x: 300, y: box.height - 120 } })

  const menu = page.getByTestId('context-menu')
  await expect(menu).toBeVisible()

  const fits = await page.evaluate(() => {
    const node = document.querySelector('[data-testid="context-menu"]')
    if (node === null) return 'no menu'
    const rect = node.getBoundingClientRect()
    if (rect.bottom > window.innerHeight) return `bottom ${String(rect.bottom)} past ${String(window.innerHeight)}`
    if (rect.right > window.innerWidth) return `right ${String(rect.right)} past ${String(window.innerWidth)}`
    if (rect.top < 0) return `top ${String(rect.top)}`
    return 'fits'
  })

  expect(fits).toBe('fits')
})
