import { readFile } from 'node:fs/promises'

import { richFromPlain } from '@openframe/core'
import type { Download, Page } from '@playwright/test'

import { buildBoard } from './boards.js'
import { expect, seedBoard, test } from './fixtures.js'

/**
 * A board taken out as a readout (ADR 0020): a Markdown file, with each claim
 * beside what it stands on.
 *
 * Seeded rather than clicked together: the subject is what leaves the board,
 * not making what is on it.
 */

test.use({ board: 'fresh' })

async function seedStudy(page: Page): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      const frame = board.add('frame', { x: 500, y: 300 }, { name: richFromPlain('Interviews') })
      const quote = board.add(
        'evidence',
        { x: 400, y: 300 },
        {
          text: richFromPlain('Three of five could not find the price'),
          source: 'September study',
        },
        undefined,
        frame,
      )
      const claim = board.add(
        'insight',
        { x: 1100, y: 300 },
        { text: richFromPlain('People cannot find the price') },
      )
      board.add('relation', { x: 0, y: 0 }, { from: claim, to: quote, predicate: 'cites' })
      board.note('Somewhere else entirely', { x: 1100, y: 700 })
    }, 'Pricing study'),
  )
}

async function contents(download: Download): Promise<string> {
  const path = await download.path()
  return readFile(path, 'utf8')
}

test.describe('exporting as Markdown', () => {
  test('takes the whole board from its menu, each claim beside its grounds', async ({ page }) => {
    await seedStudy(page)
    await page.getByTestId('board-menu').click()
    const arrives = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Export as Markdown' }).click()
    const download = await arrives

    expect(download.suggestedFilename()).toBe('pricing-study.md')
    const text = await contents(download)
    expect(text).toMatch(/^# Pricing study\n\nExported .+ · 4 objects\n/)
    expect(text).toContain('## Frame: Interviews')
    expect(text).toContain('- **Evidence:** Three of five could not find the price')
    expect(text).toContain('  - Source: September study')
    expect(text).toContain('  - Cites: Evidence: Three of five could not find the price')
    expect(text).toContain('Somewhere else entirely')
    await expect(page.getByTestId('board-announcer')).toHaveText('Exported pricing-study.md')
  })

  test('is reached from the keyboard', async ({ page }) => {
    await seedStudy(page)
    await page.getByTestId('board-menu').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('menu', { name: 'Board' })).toBeVisible()
    // Rename, Version history…, Board overview, then Export.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Export as Markdown' })).toBeFocused()
    const arrives = page.waitForEvent('download')
    await page.keyboard.press('Enter')
    expect((await arrives).suggestedFilename()).toBe('pricing-study.md')
    await expect(page.getByTestId('board-menu')).toBeFocused()
  })

  test('takes a frame, with what it holds and nothing else', async ({ page }) => {
    await seedStudy(page)
    // A frame is picked up by its title.
    await page
      .getByTestId('frame-title')
      .filter({ hasText: 'Interviews' })
      .click({ button: 'right' })
    const arrives = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Export as Markdown' }).click()
    const download = await arrives

    expect(download.suggestedFilename()).toBe('pricing-study-interviews.md')
    const text = await contents(download)
    expect(text).toMatch(/^# Pricing study — Interviews\n/)
    expect(text).toContain('Three of five could not find the price')
    expect(text).toContain(
      '  - Insight that cites this: People cannot find the price (not in this export)',
    )
    expect(text).not.toContain('Somewhere else entirely')
  })

  test('takes what is selected', async ({ page }) => {
    await seedStudy(page)
    await page.locator('[data-object-type="sticky"]').click()
    await page.locator('[data-object-type="insight"]').click({ modifiers: ['Shift'] })
    await page.locator('[data-object-type="sticky"]').click({ button: 'right' })
    const arrives = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: 'Export as Markdown' }).click()
    const download = await arrives

    expect(download.suggestedFilename()).toBe('pricing-study-selection.md')
    const text = await contents(download)
    expect(text).toMatch(/^# Pricing study — 2 selected\n/)
    expect(text).toContain('Somewhere else entirely')
    expect(text).toContain('People cannot find the price')
    expect(text).not.toContain('## Frame')
  })

  // A readout of one note is that note; its menu already fills a laptop window.
  test('is not offered for one note', async ({ page }) => {
    await seedStudy(page)
    await page.locator('[data-object-type="sticky"]').click({ button: 'right' })
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Export as Markdown' })).toHaveCount(0)
  })
})
