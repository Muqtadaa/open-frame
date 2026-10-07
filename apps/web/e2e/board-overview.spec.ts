import { richFromPlain } from '@openframe/core'
import type { Page } from '@playwright/test'

import { buildBoard, type BoardBuilder } from './boards.js'
import { CANVAS, expect, seedBoard, test } from './fixtures.js'

/**
 * The board told as a whole (Alt+S), walked from the keyboard.
 *
 * What a screen-reader user had before this was Tab: every object, one at a
 * time, in reading order. The overview says what is on the board and how it
 * is organised first, and goes to any of it.
 */

test.use({ board: 'fresh' })

async function seed(page: Page, make: (board: BoardBuilder) => void): Promise<void> {
  await seedBoard(page, buildBoard(make, 'Pricing study'))
  await page.locator(CANVAS).focus()
}

async function openOverview(page: Page): Promise<void> {
  await page.keyboard.press('Alt+s')
  await expect(page.getByRole('dialog', { name: 'Board overview' })).toBeVisible()
}

const tree = (page: Page) => page.getByRole('tree', { name: 'Objects' })
const item = (page: Page, name: string | RegExp) => page.getByRole('treeitem', { name })

test.describe('the board overview', () => {
  test('keeps Tab inside while it is open', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Pricing is hidden', { x: 1000, y: 300 })
    })
    await openOverview(page)
    for (let press = 0; press < 3; press++) await page.keyboard.press('Tab')
    await expect(
      page.getByRole('dialog', { name: 'Board overview' }).locator(':focus'),
    ).toHaveCount(1)
  })

  test(
    'says what is on the board, and goes to what is chosen',
    { tag: '@smoke' },
    async ({ page }) => {
      await seed(page, (board) => {
        const frame = board.add('frame', { x: 500, y: 300 }, { name: richFromPlain('Interviews') })
        board.add(
          'sticky',
          { x: 480, y: 320 },
          { text: richFromPlain('P07 could not find the price') },
          undefined,
          frame,
        )
        board.note('Pricing is hidden', { x: 1000, y: 300 })
      })
      await openOverview(page)

      await expect(page.getByTestId('overview-summary')).toHaveText('3 objects: 2 sticky, 1 frame.')
      await expect(tree(page)).toBeFocused()
      // A frame is listed closed, with how much it holds; its member is not shown yet.
      await expect(item(page, 'Frame: Interviews, 1 object')).toHaveAttribute(
        'aria-expanded',
        'false',
      )
      await expect(item(page, /P07/)).toHaveCount(0)

      await page.keyboard.press('ArrowRight')
      await expect(item(page, 'Frame: Interviews, 1 object')).toHaveAttribute(
        'aria-expanded',
        'true',
      )
      await page.keyboard.press('ArrowRight')
      await expect(tree(page)).toHaveAttribute('aria-activedescendant', /.+/)
      await page.keyboard.press('Enter')

      await expect(page.getByRole('dialog', { name: 'Board overview' })).toHaveCount(0)
      await expect(page.getByTestId('board-announcer')).toHaveText(
        /^Selected: P07 could not find the price/,
      )
      // The keyboard is back on the board, so Tab carries on from there.
      await expect(page.locator(CANVAS)).toBeFocused()
    },
  )

  test('leaves on Escape, giving the keyboard back', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Pricing is hidden', { x: 600, y: 300 })
    })
    await openOverview(page)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Board overview' })).toHaveCount(0)
    await expect(page.locator(CANVAS)).toBeFocused()
  })

  test('tells a quote from a note that says the same words', async ({ page }) => {
    await seed(page, (board) => {
      board.add('evidence', { x: 400, y: 300 }, { text: richFromPlain('Too expensive') })
      board.note('Too expensive', { x: 800, y: 300 })
    })
    await openOverview(page)
    await expect(item(page, 'Evidence: Too expensive')).toHaveCount(1)
    await expect(item(page, 'Sticky: Too expensive')).toHaveCount(1)
  })

  test('says what is claimed without grounds, until it cites something', async ({ page }) => {
    await seed(page, (board) => {
      const quote = board.add(
        'evidence',
        { x: 400, y: 300 },
        { text: richFromPlain('Too expensive') },
      )
      board.add('insight', { x: 800, y: 300 }, { text: richFromPlain('Price is the barrier') })
      const grounded = board.add(
        'insight',
        { x: 800, y: 600 },
        { text: richFromPlain('Trust matters') },
      )
      board.add('relation', { x: 0, y: 0 }, { from: grounded, to: quote, predicate: 'cites' })
    })
    await openOverview(page)

    await expect(page.getByTestId('overview-grounds')).toHaveText('Citing nothing: 1 insight.')
    await expect(item(page, 'Citing nothing, 1')).toHaveCount(1)
    await page.keyboard.press('ArrowRight')
    await expect(item(page, 'Insight: Price is the barrier')).toHaveCount(2)
  })

  test('lists a crowded board in part, and finds the rest by search', async ({ page }) => {
    await seed(page, (board) => {
      // Overlapping, so every one is drawn and the seed can count them.
      for (let i = 0; i < 205; i += 1) {
        board.note(`Note ${String(i)}`, {
          x: 400 + (i % 20) * 10,
          y: 300 + Math.floor(i / 20) * 10,
        })
      }
    })
    await openOverview(page)
    await expect(page.getByRole('treeitem')).toHaveCount(201)
    const more = item(page, '5 more')
    await expect(more).toHaveCount(1)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('search-panel')).toBeVisible()
  })
})
