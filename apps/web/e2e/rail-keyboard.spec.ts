import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The rail, operated from the keyboard.
 *
 * Every rail button could be tabbed to and none could be pressed: the board's
 * keymap listens on the window, claims Space for the pan hold and Enter for
 * "edit the selection", and prevented both before the focused button saw
 * them. The table size and image import had no keyboard route at all.
 */
async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

test.describe('the rail from the keyboard', () => {
  test.beforeEach(async ({ page }) => {
    await board(page)
  })

  test('Enter presses a focused tool', async ({ page }) => {
    await page.getByTestId('tool-sticky').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true')
  })

  test('Space presses a focused tool', async ({ page }) => {
    await page.getByTestId('tool-frame').focus()
    await page.keyboard.press('Space')
    await expect(page.getByTestId('tool-frame')).toHaveAttribute('aria-pressed', 'true')
  })

  test('Enter on Image asks for a file', async ({ page }) => {
    /*
     * Watched on the page rather than through Playwright's file-chooser
     * event, which arms its interception asynchronously and missed about one
     * run in three however it was awaited.
     */
    await page.evaluate(() => {
      const input = document.querySelector<HTMLInputElement>('.of-rail input[type="file"]')
      input?.addEventListener('click', (event) => {
        event.preventDefault()
        document.body.dataset.askedForFile = 'yes'
      })
    })
    await page.getByTestId('tool-image').focus()
    await expect(page.getByTestId('tool-image')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('body')).toHaveAttribute('data-asked-for-file', 'yes')
  })

  test('a letter still picks its tool while focus is on the rail', async ({ page }) => {
    await page.getByTestId('tool-select').focus()
    await page.keyboard.press('t')
    await expect(page.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'true')
  })

  /*
   * A click leaves focus on the tool it pressed. The Space held next is a pan,
   * not a second press — which is why only KEYBOARD focus keeps Space.
   */
  test('Space held after clicking a tool still pans', async ({ page }) => {
    await page.keyboard.press('s')
    await page.locator('[data-testid="canvas"]').click({ position: { x: 600, y: 400 } })
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    const note = page.locator('[data-object-type="sticky"]')
    const before = await note.boundingBox()
    expect(before).not.toBeNull()

    await page.getByTestId('tool-select').click()
    await expect(page.getByTestId('tool-select')).toBeFocused()

    await page.keyboard.down('Space')
    await page.mouse.move(300, 300)
    await page.mouse.down()
    await page.mouse.move(360, 340, { steps: 5 })
    await page.mouse.up()
    await page.keyboard.up('Space')

    const after = await note.boundingBox()
    expect(after?.x).toBeCloseTo((before?.x ?? 0) + 60, 0)
  })
})

/*
 * One run of ten tools with a single rule setting Image apart mixed getting
 * around, making things and annotating them. The groups are what a screen
 * reader announces on the way in, and what the rules between them draw.
 */
test('the rail is grouped into getting around, making and annotating', async ({ page }) => {
  await board(page)
  const rail = page.getByRole('toolbar', { name: 'Board tools' })
  const groups = rail.getByRole('group')
  await expect(groups).toHaveCount(3)
  await expect(groups.nth(0)).toHaveAttribute('aria-label', 'Navigate')
  await expect(groups.nth(1)).toHaveAttribute('aria-label', 'Make')
  await expect(groups.nth(2)).toHaveAttribute('aria-label', 'Annotate')

  const ids = async (index: number): Promise<(string | null)[]> =>
    groups
      .nth(index)
      .locator('.of-tool')
      .evaluateAll((tools) => tools.map((tool) => tool.getAttribute('data-testid')))
  expect(await ids(0)).toEqual(['tool-select', 'tool-pan'])
  // Image is something you make, not an afterthought below a rule.
  expect(await ids(1)).toEqual([
    'tool-sticky',
    'tool-text',
    'tool-shape',
    'tool-frame',
    'tool-connector',
    'tool-table',
    'tool-code',
    'tool-image',
  ])
  expect(await ids(2)).toEqual(['tool-comment'])
})

test('each tool announces its key, and nothing on the rail is nameless', async ({ page }) => {
  await board(page)
  await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-keyshortcuts', 'S')
  await expect(page.getByTestId('tool-shape')).toHaveAttribute('aria-keyshortcuts', 'U')
  // axe's one finding on the rail: the image input had no accessible name.
  await expect(page.locator('.of-rail input[type="file"]')).toHaveAccessibleName('Image file')
})

test('a tip waits for a pointer, but not for the keyboard', async ({ page }) => {
  await board(page)
  const tip = page.getByTestId('tool-text').locator('.of-tool__tip')
  const delay = (): Promise<string> => tip.evaluate((el) => getComputedStyle(el).transitionDelay)

  await page.getByTestId('tool-text').hover()
  expect(await delay()).not.toBe('0s')
  await page.mouse.move(700, 400)
  await page.getByTestId('tool-text').focus()
  expect(await delay()).toBe('0s')
})
