import type { Page } from '@playwright/test'

import { buildBoard } from './boards.js'
import { reload, saved, seedBoard, test, expect } from './fixtures.js'

/**
 * Words that go somewhere (ADR 0021): made with Mod+K or the format bar's
 * Link button, or by pasting an address; followed with Mod+click, never by a
 * plain click, which selects.
 */

const EDITOR = '[data-testid="rich-text-editor"]'
const AT = { x: 340, y: 280 }
const CLEAR = { x: 1120, y: 140 }
const HREF = 'https://example.com/pricing'
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

test.use({ board: 'fresh' })

async function noteSaying(page: Page, text: string, link?: string): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.add('sticky', AT, {
        text: link === undefined ? [{ text }] : [{ text: 'See ' }, { text, link }],
      })
    }),
  )
}

async function openEditor(page: Page): Promise<void> {
  await page.locator('[data-object-type="sticky"]').click()
  await page.keyboard.press('Enter')
  await expect(page.locator(EDITOR)).toBeFocused()
}

/** Selects characters `from` to `to` of the editor's first text. */
async function select(page: Page, from: number, to: number): Promise<void> {
  await page.locator(EDITOR).evaluate(
    (element, [start, end]) => {
      const node = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()
      if (node === null) throw new Error('the editor holds no text to select')
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, end)
      const selection = document.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    },
    [from, to] as const,
  )
}

async function paste(page: Page, kinds: Record<string, string>): Promise<void> {
  await page.locator(EDITOR).evaluate((element, entries) => {
    const data = new DataTransfer()
    for (const [type, value] of Object.entries(entries)) data.setData(type, value)
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: data })
    element.dispatchEvent(event)
  }, kinds)
}

test.describe('making a link', () => {
  test('Mod+K links the selected words, and they keep it', { tag: '@smoke' }, async ({ page }) => {
    await noteSaying(page, 'Pricing is hidden')
    await openEditor(page)
    await select(page, 0, 7)
    await page.keyboard.press(`${MOD}+k`)
    const field = page.getByTestId('format-link-field')
    await expect(field).toBeFocused()
    await field.fill(HREF)
    await page.keyboard.press('Enter')

    await expect(page.locator(`${EDITOR} a`)).toHaveText('Pricing')
    await expect(page.locator(EDITOR)).toBeFocused()
    await expect(page.getByTestId('format-link')).toHaveAttribute('aria-pressed', 'true')

    await page.mouse.click(CLEAR.x, CLEAR.y)
    await saved(page)
    await reload(page)
    const link = page.locator('[data-object-type="sticky"] a')
    await expect(link).toHaveText('Pricing')
    await expect(link).toHaveAttribute('href', HREF)
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('is reached from the format bar by keyboard alone', async ({ page }) => {
    await noteSaying(page, 'Pricing is hidden')
    await openEditor(page)
    await select(page, 0, 7)
    await page.keyboard.press('Alt+F10')
    await page.keyboard.press('End')
    await expect(page.getByTestId('format-link')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('format-link-field')).toBeFocused()
    await page.keyboard.type(HREF)
    await page.keyboard.press('Enter')
    await expect(page.locator(`${EDITOR} a`)).toHaveText('Pricing')
    await expect(page.locator(EDITOR)).toBeFocused()
  })

  test('refuses an address a board may not send people to', async ({ page }) => {
    await noteSaying(page, 'Pricing is hidden')
    await openEditor(page)
    await select(page, 0, 7)
    await page.getByTestId('format-link').click()
    const field = page.getByTestId('format-link-field')
    await field.fill('javascript:alert(1)')
    await page.keyboard.press('Enter')
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert')).toHaveText('Not a web or mail address')
    await page.keyboard.press('Escape')
    await expect(page.locator(EDITOR)).toBeFocused()
    await expect(page.locator(`${EDITOR} a`)).toHaveCount(0)
  })

  test('takes a link off again', async ({ page }) => {
    await noteSaying(page, 'pricing', HREF)
    await openEditor(page)
    // A caret inside the link, between "pri" and "cing".
    await page.locator(`${EDITOR} a`).evaluate((anchor) => {
      const node = document.createTreeWalker(anchor, NodeFilter.SHOW_TEXT).nextNode()
      if (node === null) throw new Error('the link holds no text')
      const range = document.createRange()
      range.setStart(node, 3)
      range.collapse(true)
      document.getSelection()?.removeAllRanges()
      document.getSelection()?.addRange(range)
    })
    await page.keyboard.press(`${MOD}+k`)
    await expect(page.getByTestId('format-link-field')).toHaveValue(HREF)
    await page.getByTestId('format-unlink').click()
    await expect(page.locator(`${EDITOR} a`)).toHaveCount(0)
    await expect(page.locator(EDITOR)).toHaveText('See pricing')
  })

  test('an address pasted over words links them', async ({ page }) => {
    await noteSaying(page, 'Pricing is hidden')
    await openEditor(page)
    await select(page, 0, 7)
    await paste(page, { 'text/plain': HREF })
    await expect(page.locator(`${EDITOR} a`)).toHaveText('Pricing')
    await expect(page.locator(EDITOR)).toHaveText('Pricing is hidden')
  })

  test('pasted markup keeps its links, and drops the ones that would run', async ({ page }) => {
    await noteSaying(page, '')
    await openEditor(page)
    await paste(page, {
      'text/html': `<a href="${HREF}">safe</a> and <a href="javascript:alert(1)">not</a>`,
      'text/plain': 'safe and not',
    })
    await expect(page.locator(`${EDITOR} a`)).toHaveCount(1)
    await expect(page.locator(`${EDITOR} a`)).toHaveAttribute('href', HREF)
  })
})

test.describe('following a link', () => {
  test('a plain click selects the note and goes nowhere', async ({ page }) => {
    await noteSaying(page, 'pricing', HREF)
    let opened = 0
    page.context().on('page', () => {
      opened += 1
    })
    await page.locator('[data-object-type="sticky"] a').click()
    await expect(page.locator('[data-object-type="sticky"]')).toHaveAttribute(
      'data-selected',
      'true',
    )
    await expect(page).toHaveURL(/board=/)
    expect(opened).toBe(0)
  })

  test('Mod+click opens it in a new tab', async ({ page }) => {
    await noteSaying(page, 'pricing', HREF)
    // The tab is a new page, so the address is answered for the whole context.
    await page.context().route(HREF, (route) => route.fulfill({ status: 200, body: 'pricing' }))
    const popup = page.context().waitForEvent('page')
    await page.locator('[data-object-type="sticky"] a').click({ modifiers: ['ControlOrMeta'] })
    await (await popup).waitForURL(HREF)
    await expect(page).toHaveURL(/board=/)
  })
})

test('a table cell takes a link while it is typed in', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.add('table', { x: 340, y: 300 })
    }),
  )
  await page.locator('[data-object-type="table"]').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Pricing')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press(`${MOD}+k`)
  await page.getByTestId('format-link-field').fill(HREF)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('table-cell-field').locator('a')).toHaveText('Pricing')
  await page.keyboard.press('Enter')
  await page.mouse.click(CLEAR.x, CLEAR.y)
  await expect(page.getByTestId('table-editor')).toHaveCount(0)
  await expect(page.locator('[data-object-type="table"] a')).toHaveAttribute('href', HREF)
})
