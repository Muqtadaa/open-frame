import type { Page } from '@playwright/test'

import { CANVAS, expect, saved, seedBoard, test, undo } from './fixtures.js'
import { buildBoard } from './boards.js'

test.use({ board: 'fresh' })

/**
 * Dot voting: a round set up from the context menu, dots placed with the
 * vote tool or from the keyboard, then revealed, ranked and carried forward.
 */
const FIRST = { x: 300, y: 300 }
const SECOND = { x: 560, y: 300 }
const heron = { key: 'g_heron', name: 'Heron', hue: 200 }

async function twoNotes(page: Page): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Show the price early', FIRST)
      board.note('Free returns', SECOND)
    }),
  )
}

const dots = (page: Page, nth: number) =>
  page.locator('[data-object-type="sticky"]').nth(nth).getByTestId('votes')

test(
  'starts a round on the whole board, and votes with the tool',
  { tag: '@smoke' },
  async ({ page }) => {
    await twoNotes(page)
    await page.locator(CANVAS).click({ button: 'right', position: { x: 800, y: 600 } })
    await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()

    const setup = page.getByTestId('voting-setup')
    await expect(setup.getByRole('heading')).toHaveText('Dot voting · whole board')
    await expect(page.getByTestId('voting-title')).toBeFocused()
    await page.getByTestId('voting-title').fill('What first?')
    await page.getByTestId('voting-per-person').fill('2')
    await page.getByTestId('voting-start').click()

    const status = page.getByTestId('voting-status')
    await expect(status).toHaveText('2 of 2 votes left')
    // Starting a round arms the tool.
    await expect(page.getByTestId('voting-vote')).toHaveAttribute('aria-pressed', 'true')

    await page.locator(CANVAS).click({ position: FIRST })
    await page.locator(CANVAS).click({ position: FIRST })
    await expect(dots(page, 0)).toHaveText('2')
    await expect(status).toHaveText('0 of 2 votes left')

    // A third is refused, and says why.
    await page.locator(CANVAS).click({ position: SECOND })
    await expect(page.getByTestId('toast-body')).toHaveText('No votes left')
    await expect(dots(page, 1)).toHaveCount(0)

    // Alt takes one back.
    await page.locator(CANVAS).click({ position: FIRST, modifiers: ['Alt'] })
    await expect(dots(page, 0)).toHaveText('1')
    await saved(page)
  },
)

test('votes from the keyboard through the context menu, on the notes the round covers', async ({
  page,
}) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Show the price early', FIRST)
      const second = board.note('Free returns', SECOND)
      board.voting({ ids: [second] })
    }),
  )
  await page.locator(CANVAS).click({ position: SECOND })
  await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: 'Dot voting' }).press('ArrowRight')
  await page.getByRole('menuitem', { name: 'Add vote' }).press('Enter')
  await expect(dots(page, 1)).toHaveText('1')

  // The round holds the note it was started on, and nothing else.
  await page.keyboard.press('Escape')
  await page.locator(CANVAS).click({ position: FIRST })
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Dot voting' })).toHaveCount(0)
})

test('hides other people’s dots until revealed, then ranks the notes', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const first = board.note('Show the price early', FIRST)
      const second = board.note('Free returns', SECOND)
      const round = board.voting({ hidden: true })
      board.vote(round, second, heron)
      board.vote(round, second, heron)
      board.vote(round, first, heron)
    }),
  )
  await expect(page.getByTestId('voting')).toBeVisible()
  await expect(dots(page, 0)).toHaveCount(0)
  await expect(dots(page, 1)).toHaveCount(0)
  await expect(page.getByTestId('voting-results')).toHaveCount(0)

  await page.getByTestId('voting-reveal').click()
  await expect(dots(page, 1)).toHaveText('2')
  await expect(dots(page, 0)).toHaveText('1')

  await page.getByTestId('voting-results').click()
  const list = page.getByTestId('voting-list').getByRole('listitem')
  await expect(list).toHaveCount(2)
  await expect(list.first()).toContainText('Free returns')

  await page.getByTestId('voting-select-top').click()
  await expect(page.locator('[data-object-type="sticky"][data-selected="true"]')).toHaveCount(2)
})

test('ranks tied notes in the order they sit on the board', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const first = board.note('Show the price early', FIRST)
      const second = board.note('Free returns', SECOND)
      const round = board.voting({})
      board.vote(round, first, heron)
      board.vote(round, second, heron)
    }),
  )
  // Send the later note to the back: it is now first in board order, and
  // still last by id.
  await page.locator(CANVAS).click({ position: SECOND })
  await page.keyboard.press('Shift+[')
  await page.getByTestId('voting-results').click()
  const list = page.getByTestId('voting-list').getByRole('listitem')
  await expect(list.first()).toContainText('Free returns')
  await expect(list.last()).toContainText('Show the price early')
})

test('ends a round, keeps the counts, and clears it with one undo to bring it back', async ({
  page,
}) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const first = board.note('Show the price early', FIRST)
      board.note('Free returns', SECOND)
      const round = board.voting({})
      board.vote(round, first, heron)
    }),
  )
  await page.getByTestId('voting-end').click()
  await expect(page.getByTestId('voting-status')).toHaveText('Voting ended')
  await expect(dots(page, 0)).toHaveText('1')
  await expect(page.getByTestId('voting-vote')).toHaveCount(0)

  await page.getByTestId('voting-clear').click()
  await expect(page.getByTestId('voting')).toHaveCount(0)
  await expect(dots(page, 0)).toHaveCount(0)

  await undo(page)
  await expect(page.getByTestId('voting')).toBeVisible()
  await expect(dots(page, 0)).toHaveText('1')
})

test('starts a round on what one frame holds, and only that', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Outside', { x: 900, y: 500 })
      board.add('frame', { x: 400, y: 320 }, { title: [{ text: 'Ideas' }] })
    }),
  )
  // By its title: a frame's body is hollow, so a press there reaches the board.
  await page.getByTestId('frame-title').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await expect(page.getByTestId('voting-setup').getByRole('heading')).toHaveText(
    'Dot voting · this frame',
  )
  await page.getByTestId('voting-start').click()

  // The note outside the frame is not part of it.
  await page.locator(CANVAS).click({ position: { x: 900, y: 500 } })
  await expect(page.getByTestId('toast-body')).toHaveText('That note is not part of this vote')
})

test('cancels a round that was never started, leaving nothing on the board', async ({ page }) => {
  await twoNotes(page)
  await page.locator(CANVAS).click({ button: 'right', position: { x: 800, y: 600 } })
  await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('voting-setup')).toHaveCount(0)
  await expect(page.getByTestId('voting')).toHaveCount(0)
})
