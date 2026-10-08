import { expect, test, type Page } from '@playwright/test'

import { CANVAS, goto } from './fixtures.js'
import { BOARD_URL } from './routes.js'

/**
 * Opening an object to edit it must not reflow what is written in it.
 *
 * The shared editor rule said `font: inherit`, which reset each object's own
 * size and leading to the world's 16px: a note set at 15px on a 1.35 line
 * broke its lines in different places the moment it was double-clicked, so the
 * word you aimed at was no longer where you aimed.
 */
const EDITOR = '[contenteditable="true"]'
const WORDS =
  'The pricing page confused three of five participants who could not find the annual toggle anywhere'

async function lines(page: Page, selector: string): Promise<{ font: string; lines: number }> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)))
      const style = getComputedStyle(element)
      return { font: `${style.fontSize}/${style.lineHeight}`, lines: tops.size }
    })
}

test.beforeEach(async ({ page }) => {
  await goto(page, BOARD_URL)
  await expect(page.getByTestId('tool-select')).toBeVisible()
})

for (const { tool, drawn } of [
  { tool: 's', drawn: '[data-testid="sticky-text"]' },
  { tool: 't', drawn: '[data-testid="text-body"]' },
]) {
  test(`a ${tool === 's' ? 'note' : 'text'} breaks its lines in the same places while edited`, async ({
    page,
  }) => {
    await page.keyboard.press(tool)
    await page.locator(CANVAS).click({ position: { x: 400, y: 300 } })
    await expect(page.locator(EDITOR)).toBeFocused()
    await page.keyboard.type(WORDS)
    const editing = await lines(page, EDITOR)
    await page.keyboard.press('Escape')
    await expect(page.locator(EDITOR)).toHaveCount(0)
    const shown = await lines(page, drawn)
    expect(editing).toEqual(shown)
  })
}
