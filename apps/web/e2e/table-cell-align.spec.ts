import { expect, test, type Locator, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * Alignment per cell, over the table's own.
 *
 * A table could be aligned as a whole from the record panel, and no cell could
 * be told otherwise — a column of figures right-aligned under left-aligned
 * headings was not something the table could say.
 */
const CANVAS = '[data-testid="canvas"]'
const AWAY = { x: 1100, y: 640 }

const drawn = (page: Page): Locator => page.locator('[role="table"] > div')

async function tableWith(page: Page, values: readonly string[]): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.getByTestId('tool-select')).toBeVisible()
  await page.getByTestId('tool-table').click()
  await page.locator(CANVAS).click({ position: { x: 340, y: 300 } })
  await expect(page.getByTestId('table-editor')).toHaveAttribute('data-mode', 'navigate')
  for (const value of values) {
    await page.keyboard.type(value)
    await page.keyboard.press('Tab')
  }
}

async function leave(page: Page): Promise<void> {
  await page.locator(CANVAS).click({ position: AWAY })
  await expect(page.getByTestId('table-editor')).toHaveCount(0)
}

/** Where a cell's text sits, horizontally and vertically, as the board draws it. */
async function placement(cell: Locator): Promise<{ across: string; down: string }> {
  return cell.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      across: style.textAlign,
      down: style.getPropertyValue('--of-valign').trim(),
    }
  })
}

test('a cell is aligned on its own, across and down', async ({ page }) => {
  await tableWith(page, ['Name', 'Total', 'Q1'])
  // Tab from C1 wrapped to A2; B1 is up and one across.
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowRight')

  await page.getByTestId('cell-align-end').click()
  await page.getByTestId('cell-valign-bottom').click()
  await expect(page.getByTestId('cell-align-end')).toHaveAttribute('aria-checked', 'true')
  await leave(page)

  expect(await placement(drawn(page).nth(1))).toEqual({ across: 'right', down: 'flex-end' })
  // Its neighbours still follow the table.
  expect((await placement(drawn(page).nth(0))).across).toBe('left')
})

test('a cell’s own alignment beats the table’s, and the rest follow the table', async ({
  page,
}) => {
  await tableWith(page, ['Name', 'Total'])
  // Tab after the second value stops on C1: back two to A1.
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.getByTestId('cell-align-center').click()
  await leave(page)

  // The whole table, from the record panel.
  await drawn(page).nth(1).click()
  await page.getByTestId('align-end').click()

  expect((await placement(drawn(page).nth(0))).across).toBe('center')
  expect((await placement(drawn(page).nth(1))).across).toBe('right')
})

test('Reset gives a cell back to the table', async ({ page }) => {
  await tableWith(page, ['Name'])
  // Tab after the one value stops on B1: back one to A1.
  await page.keyboard.press('ArrowLeft')
  await page.getByTestId('cell-align-center').click()
  await page.getByTestId('cell-clear').click()
  await leave(page)
  expect((await placement(drawn(page).nth(0))).across).toBe('left')
})

test('is one undo with the rest of the edit', async ({ page }) => {
  await tableWith(page, ['Name'])
  // Tab after the one value stops on B1: back one to A1.
  await page.keyboard.press('ArrowLeft')
  await page.getByTestId('cell-align-end').click()
  await leave(page)
  expect((await placement(drawn(page).nth(0))).across).toBe('right')
  await page.keyboard.press('ControlOrMeta+z')
  // The whole edit goes back in one step — its text and its alignment.
  await expect(drawn(page).nth(0)).toHaveText('')
  expect((await placement(drawn(page).nth(0))).across).toBe('left')
})
