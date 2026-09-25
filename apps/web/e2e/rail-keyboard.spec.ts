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

  test('Enter on Image opens the file chooser', async ({ page }) => {
    await page.getByTestId('tool-image').focus()
    const chooser = page.waitForEvent('filechooser')
    await page.keyboard.press('Enter')
    await chooser
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
