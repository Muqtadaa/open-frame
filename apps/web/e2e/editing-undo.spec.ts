import { CANVAS, expect, openBoard, test } from './fixtures.js'

/**
 * Undo, while a text editor is open, means the TEXT.
 *
 * Nothing is written to the document until an edit commits, so there is no
 * board history for what was just typed — the field's own history is the only
 * thing that knows about it. Ctrl+Z already reached it, because the keymap
 * leaves a focused field alone. The BUTTON did not: pressing it blurred the
 * field, committed what was there, and then undid something else entirely.
 *
 * Two controls bound to one shortcut have to agree, which is what these test.
 */

test('the keyboard undoes typing rather than the board', async ({ page }) => {
  await openBoard(page)
  await page.getByTestId('tool-code').click()
  await page.locator(CANVAS).click({ position: { x: 340, y: 240 } })

  const input = page.getByTestId('code-input')
  await input.fill('const a = 1')
  await input.press('ControlOrMeta+a')
  await input.press('Backspace')
  await expect(input).toHaveValue('')

  await input.press('ControlOrMeta+z')
  await expect(input).toHaveValue('const a = 1')
  // And the block itself is still there: this undid the typing, not the block.
  await expect(page.getByTestId('code-editor')).toBeVisible()
  await expect(page.locator('[data-object-id]')).toHaveCount(1)
})

test('the undo button does the same thing the shortcut does', async ({ page }) => {
  await openBoard(page)
  await page.getByTestId('tool-code').click()
  await page.locator(CANVAS).click({ position: { x: 340, y: 240 } })

  const input = page.getByTestId('code-input')
  await input.fill('const a = 1')
  await input.press('ControlOrMeta+a')
  await input.press('Backspace')

  await page.getByTestId('undo').click()

  /*
   * The text is back AND the editor is still open. Before this, the press
   * blurred the field, committed the empty block, and undid that instead —
   * so the editor vanished and the typing was gone for good.
   */
  await expect(page.getByTestId('code-editor')).toBeVisible()
  await expect(input).toHaveValue('const a = 1')
})

test('the undo button still undoes the board when nothing is being edited', async ({ page }) => {
  await openBoard(page)
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: { x: 300, y: 240 } })
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')
  await expect(page.locator('[data-object-id]')).toHaveCount(1)

  // No editor open, so the button means what it always meant.
  await page.getByTestId('undo').click()
  await expect(page.locator('[data-object-id]')).toHaveCount(0)
})
