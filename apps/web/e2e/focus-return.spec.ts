import { expect, test } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * Leaving something on the board hands the keyboard back to the board
 * (audit 2026-09-27).
 *
 * Focus that falls to BODY restarts the Tab order at "All boards", about
 * thirty stops from the canvas — after every edit, for somebody working by
 * keyboard alone.
 */
const CANVAS = '[data-testid="canvas"]'

test.beforeEach(async ({ page }) => {
  await page.goto(BOARD_URL)
  await page.waitForSelector('[data-testid="status-bar"]')
})

test('Escape out of a note being written returns focus to the canvas', async ({ page }) => {
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: { x: 300, y: 250 } })
  await expect(page.locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type('hello')
  await page.keyboard.press('Escape')
  await expect(page.locator(CANVAS)).toBeFocused()
})

test('Escape out of an edit opened by the keyboard returns focus to the canvas', async ({
  page,
}) => {
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: { x: 300, y: 250 } })
  await page.keyboard.press('Escape')
  // Nothing selected, so Tab from the canvas walks to the first object.
  await page.locator(CANVAS).focus()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(page.locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator(CANVAS)).toBeFocused()
})

test('clicking the canvas gives it the keyboard', async ({ page }) => {
  await page.locator(CANVAS).click({ position: { x: 500, y: 400 } })
  await expect(page.locator(CANVAS)).toBeFocused()
})

/*
 * The record panel goes when the selection does, and it took the keyboard
 * with it: Escape from a swatch, or its own Delete, left focus on BODY.
 */
test.describe('when the record panel goes', () => {
  test.beforeEach(async ({ page }) => {
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: { x: 300, y: 250 } })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('inspector')).toBeVisible()
  })

  test('Escape from one of its controls returns focus to the canvas', async ({ page }) => {
    await page.getByTestId('inspector').getByRole('radio').first().focus()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('inspector')).toHaveCount(0)
    await expect(page.locator(CANVAS)).toBeFocused()
  })

  test('its Delete returns focus to the canvas', async ({ page }) => {
    await page.getByTestId('inspector-delete').click()
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(0)
    await expect(page.locator(CANVAS)).toBeFocused()
  })
})
