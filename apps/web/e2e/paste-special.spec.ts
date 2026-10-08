import type { Page } from '@playwright/test'

import { CANVAS, expect, test, useClipboard } from './fixtures.js'

/**
 * Paste special: what the clipboard holds, made into what somebody asks for
 * from the board's menu, rather than what the board would guess from Mod+V.
 */

test.use({ board: 'fresh' })

test.beforeEach(async ({ context }) => {
  await useClipboard(context)
})

/** Puts what another application would on the system clipboard. */
async function copyFromElsewhere(page: Page, kinds: Record<string, string>): Promise<void> {
  await page.evaluate(async (entries) => {
    const item = new ClipboardItem(
      Object.fromEntries(
        Object.entries(entries).map(([type, value]) => [type, new Blob([value], { type })]),
      ),
    )
    await navigator.clipboard.write([item])
  }, kinds)
}

async function pasteSpecial(page: Page, as: string): Promise<void> {
  await page.locator(CANVAS).click({ position: { x: 600, y: 400 }, button: 'right' })
  await page.getByRole('menuitem', { name: 'Paste special' }).click()
  await page.getByRole('menuitem', { name: as, exact: true }).click()
}

const LIST = '- Price is hidden\n- Shipping costs surprise people\n\n- Returns are hard to find\n'

test.describe('paste special', () => {
  test('makes a note of each line, as one step', async ({ page }) => {
    await copyFromElsewhere(page, { 'text/plain': LIST })
    await pasteSpecial(page, 'As notes')

    const notes = page.locator('[data-object-type="sticky"]')
    await expect(notes).toHaveCount(3)
    await expect(notes.nth(0)).toContainText('Price is hidden')
    await expect(notes.nth(2)).toContainText('Returns are hard to find')
    await expect(page.getByTestId('board-announcer')).toHaveText('Pasted 3 notes')

    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    await expect(notes).toHaveCount(0)
  })

  test('makes one text box of the words, formatting and all', async ({ page }) => {
    await copyFromElsewhere(page, {
      'text/html': '<p>Pricing <b>is hidden</b></p>',
      'text/plain': 'Pricing is hidden',
    })
    await pasteSpecial(page, 'As a text box')
    await expect(page.locator('[data-object-type="text"]')).toHaveCount(1)
    await expect(page.locator('[data-object-type="text"] strong')).toHaveText('is hidden')
  })

  test('makes a table of comma-separated words, even ones that read like prose', async ({
    page,
  }) => {
    await copyFromElsewhere(page, { 'text/plain': 'Red, green\nBlue, yellow' })
    await pasteSpecial(page, 'As a table')
    await expect(page.locator('[data-object-type="table"]')).toHaveCount(1)
    await expect(page.locator('[data-object-type="table"]')).toContainText('yellow')
  })

  test('drops the formatting as plain text', async ({ page }) => {
    await copyFromElsewhere(page, {
      'text/html': '<p><b>Pricing is hidden</b></p>',
      'text/plain': 'Pricing is hidden',
    })
    await pasteSpecial(page, 'As plain text')
    await expect(page.locator('[data-object-type="text"]')).toContainText('Pricing is hidden')
    await expect(page.locator('[data-object-type="text"] strong')).toHaveCount(0)
  })

  test('says how to paste when the clipboard cannot be read', async ({ page }) => {
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          read: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
          readText: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')),
        },
      })
    })
    await pasteSpecial(page, 'As notes')
    await expect(page.getByTestId('toast')).toContainText('The clipboard could not be read.')
    await expect(page.locator('[data-object-id]')).toHaveCount(0)
  })
})

/*
 * Mod+V reads comma-separated text as a table only when it is plainly one;
 * prose with commas is words. Paste special › As a table is the way to say
 * otherwise.
 */
test('Mod+V makes a table of a CSV file’s rows', async ({ page }) => {
  await copyFromElsewhere(page, { 'text/plain': 'Who,What\nP07,Price\nP09,Shipping\n' })
  await page.locator(CANVAS).click({ position: { x: 20, y: 20 } })
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+v' : 'Control+v')
  await expect(page.locator('[data-object-type="table"]')).toHaveCount(1)
})
