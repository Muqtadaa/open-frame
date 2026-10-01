import type { Page } from '@playwright/test'

import { buildBoard } from './boards.js'
import { CANVAS, expect, seedBoard, test } from './fixtures.js'

/**
 * Hiding says where the objects went, and gives them back.
 *
 * "Hide" used to clear the selection and leave nothing behind: the objects
 * were gone from the board, nothing said so, and nothing anywhere showed them
 * again — only undo, if it was still on the stack.
 */
test.use({ board: 'fresh' })

async function hideTheNote(page: Page): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Kept', { x: 300, y: 300 })
      board.note('Hidden', { x: 600, y: 300 })
    }),
  )
  await page.locator('[data-object-type="sticky"]').nth(1).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Hide' }).click()
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)
}

test('says what was hidden, and Show brings it back selected', async ({ page }) => {
  await hideTheNote(page)
  await expect(page.getByTestId('toast-body')).toHaveText('1 object hidden')
  await page.getByTestId('toast-action').click()
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
  await expect(page.locator('[data-object-type="sticky"][data-selected="true"]')).toHaveCount(1)
})

test('the board’s own menu shows what is hidden, long after the toast', async ({ page }) => {
  await hideTheNote(page)
  await page.locator(CANVAS).click({ button: 'right', position: { x: 900, y: 600 } })
  await page.getByRole('menuitem', { name: 'Show 1 hidden object' }).click()
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
})

test('offers nothing to show when nothing is hidden', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => board.note('Kept', { x: 300, y: 300 })),
  )
  await page.locator(CANVAS).click({ button: 'right', position: { x: 900, y: 600 } })
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /hidden/ })).toHaveCount(0)
})
